import { describe, expect, it, vi } from "vitest";
import { collectSummaryFacts, draftSummary, SummaryError, type CallModel } from "@/lib/aiSummaryServer";
import { SYSTEM_PROMPT } from "@/lib/aiSummary";
import type { AssessmentItem } from "@/lib/database.types";

const facts = { level: 1, form: "Form A", how: "played as a game", overall: "Needs Support", recommendations: [] };
const answer = {
  overview: "{{name}} is learning letters.",
  strengths: ["Names some letters."],
  toSupport: ["Letter sounds."],
  nextSteps: ["Say the sound of one letter each morning."],
  familyNote: "{{name}} is trying hard. Please point out letters at home.",
};
const reply = (over: Partial<Awaited<ReturnType<CallModel>>> = {}): CallModel =>
  vi.fn(async () => ({ text: JSON.stringify(answer), stopReason: "end_turn", model: "claude-opus-5-5", ...over }));

describe("draftSummary", () => {
  it("returns the parsed summary and the model that wrote it", async () => {
    const call = reply();
    const { content, model } = await draftSummary(facts, call, "claude-opus-5-5");
    expect(content.overview).toContain("{{name}}");
    expect(model).toBe("claude-opus-5-5");
    expect(call).toHaveBeenCalledWith(SYSTEM_PROMPT, expect.stringContaining("Needs Support"), "claude-opus-5-5");
  });

  it("explains a refusal in words a teacher can act on", async () => {
    await expect(draftSummary(facts, reply({ stopReason: "refusal", text: null }))).rejects.toThrow(/write it yourself/);
  });

  it("rejects an incomplete answer", async () => {
    await expect(draftSummary(facts, reply({ stopReason: "max_tokens" }))).rejects.toThrow(SummaryError);
  });

  it("rejects an answer that isn't valid JSON, or that doesn't fit the shape", async () => {
    await expect(draftSummary(facts, reply({ text: "Here is your summary: ..." }))).rejects.toThrow(/wrong shape/);
    await expect(draftSummary(facts, reply({ text: JSON.stringify({ overview: "only this" }) }))).rejects.toThrow(/wrong shape/);
  });

  it("turns a failed request into a message that doesn't leak details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: CallModel = async () => {
      throw new Error("401 invalid x-api-key sk-ant-secret");
    };
    const error = await draftSummary(facts, broken).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SummaryError);
    expect((error as Error).message).not.toMatch(/sk-ant|401/);
  });
});

// A just-enough stand-in for the admin client, answering by table.
function fakeAdmin(tables: Record<string, unknown>) {
  const builder = (data: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) b[m] = () => b;
    b.single = async () => ({ data, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
    return b;
  };
  return { from: (table: string) => builder(tables[table]) } as never;
}

describe("collectSummaryFacts for a game", () => {
  const choice = (id: string, prompt: string, right: string, wrong: string): AssessmentItem => ({
    id, skillAreaKey: "letterNames", type: "choice", prompt,
    options: [{ text: right, isCorrect: true }, { text: wrong, isCorrect: false }],
  });
  const items: AssessmentItem[] = [
    choice("LN01", "Tap the letter s.", "s", "z"),
    choice("LN02", "Tap the letter m.", "m", "n"),
    { id: "WT01", skillAreaKey: "writing", type: "text", prompt: "Write your name.", say: "Write your name." },
    { id: "WT02", skillAreaKey: "writing", type: "text", prompt: "Write the letter for the first sound you hear.", expectedText: "s" },
    { id: "AT01", skillAreaKey: "readingAttitude", type: "choice", prompt: "How do you feel about learning to read?", options: [{ text: "😀 Happy", isCorrect: true }] },
  ];
  const admin = fakeAdmin({
    assessment_sessions: { id: "s1", student_id: "child-1", assessments: { level: 1, form: "A", delivery: "game", items } },
    results: [{ score: 50, flagged_as_difficulty: true, skill_areas: { id: "k1", name: "Letter names" } }],
    recommendation_rules: [{ skill_area_id: "k1", recommendation_text: "Practise letter names.", program_reference: null, skill_areas: { name: "Letter names" } }],
    responses: [
      { item_id: "LN01", answer: "z", is_correct: false },
      { item_id: "LN02", answer: "m", is_correct: true },
      { item_id: "WT01", answer: "Ama Mensah", is_correct: true },
      { item_id: "WT02", answer: "c", is_correct: false },
      { item_id: "AT01", answer: "😀 Happy", is_correct: true },
    ],
  });

  it("describes what was missed and what the recommendations say, and sends no name", async () => {
    const facts = await collectSummaryFacts(admin, "s1");
    expect(facts.skills).toEqual([{ name: "Letter names", percent: 50, flagged: true }]);
    expect(facts.misses).toEqual([
      { part: "Letter names", question: "Tap the letter s.", answered: "z", correct: "s" },
      { part: "Writing", question: "Write the letter for the first sound you hear.", answered: "c", correct: "s" },
    ]);
    expect(facts.recommendations).toEqual([{ skill: "Letter names", text: "Practise letter names." }]);
    expect(facts.attitude).toEqual([{ question: "How do you feel about learning to read?", answer: "Happy" }]);
    // The name the child typed in the writing task never leaves the server.
    expect(JSON.stringify(facts)).not.toContain("Ama");
    expect(JSON.stringify(facts)).not.toContain("child-1");
  });
});
