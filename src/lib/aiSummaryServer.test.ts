import { describe, expect, it, vi } from "vitest";
import { collectSummaryFacts, draftSummary, SummaryError, type CallModel } from "@/lib/aiSummaryServer";
import { SYSTEM_PROMPT } from "@/lib/aiSummary";
import type { AssessmentItem } from "@/lib/database.types";

const facts = { level: 1, form: "Form A", how: "played as a game", overall: "Needs Support", recommendations: [] };
const answer = {
  headline: "{{name}} is ready to begin Level 1.",
  overview: "{{name}} is learning letters.",
  canDo: ["Names some letters."],
  notYet: ["Letter sounds."],
  firstThings: [{ title: "Learn letter sounds", text: "Two new sounds a week." }],
  atSchool: ["Teach two new letter sounds each week."],
  atHome: [{ title: "I spy", text: "Play I spy with first sounds." }],
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

describe("a free or self-hosted model", () => {
  const wrapped = "Sure! Here is the summary:\n```json\n" + JSON.stringify(answer) + "\n```";

  it("is understood when its reply is wrapped in fences or chatter", async () => {
    const { content } = await draftSummary(facts, reply({ text: wrapped }), "openai/gpt-oss-120b", 2);
    expect(content.firstThings).toHaveLength(1);
  });

  it("gets a second go when the first reply misses the format", async () => {
    const call = vi
      .fn<CallModel>()
      .mockResolvedValueOnce({ text: "I think the child did well.", stopReason: "stop", model: "m" })
      .mockResolvedValueOnce({ text: JSON.stringify(answer), stopReason: "stop", model: "m" });
    const { content } = await draftSummary(facts, call, "m", 2);
    expect(call).toHaveBeenCalledTimes(2);
    expect(content.overview).toContain("{{name}}");
  });

  it("gives up with a clear message after the allowed goes", async () => {
    const call = reply({ text: "no json at all" });
    await expect(draftSummary(facts, call, "m", 2)).rejects.toThrow(/wrong shape/);
    expect(call).toHaveBeenCalledTimes(2);
  });
});

describe("callOpenAiCompatible", () => {
  const realFetch = globalThis.fetch;
  const body = (content: string, finish = "stop") => ({ model: "llama-3.3-70b", choices: [{ message: { content }, finish_reason: finish }] });

  it("posts to the service's chat endpoint with the key, and returns the reply", async () => {
    process.env.AI_REPORT_BASE_URL = "https://api.groq.example/openai/v1/";
    process.env.AI_REPORT_API_KEY = "gsk_test";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body(JSON.stringify(answer))), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { callOpenAiCompatible } = await import("@/lib/aiSummaryServer");
    const result = await callOpenAiCompatible("system", "user", "llama-3.3-70b");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.example/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer gsk_test");
    const sent = JSON.parse(init.body as string);
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.messages[0].content).toContain('"firstThings"');
    expect(result).toMatchObject({ stopReason: "stop", model: "llama-3.3-70b" });
    globalThis.fetch = realFetch;
  });

  it("asks a gpt-oss model to think briefly and leaves room for it", async () => {
    process.env.AI_REPORT_BASE_URL = "https://api.groq.example/openai/v1";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body("{}")), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { callOpenAiCompatible } = await import("@/lib/aiSummaryServer");
    await callOpenAiCompatible("s", "u", "openai/gpt-oss-120b");
    await callOpenAiCompatible("s", "u", "some-other-model");
    const sent = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(sent[0].reasoning_effort).toBe("low");
    expect(sent[1]).not.toHaveProperty("reasoning_effort");
    expect(sent[0].max_tokens).toBeGreaterThanOrEqual(4000);
    globalThis.fetch = realFetch;
  });

  it("asks again without JSON mode when the service doesn't know it", async () => {
    process.env.AI_REPORT_BASE_URL = "http://localhost:11434/v1";
    delete process.env.AI_REPORT_API_KEY;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unsupported", { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(body("{}")), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { callOpenAiCompatible } = await import("@/lib/aiSummaryServer");
    await callOpenAiCompatible("s", "u", "gemma");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.response_format).toBeUndefined();
    expect((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("authorization");
    globalThis.fetch = realFetch;
  });

  it("reports a cut-off reply as incomplete, and a filtered one as a refusal", async () => {
    process.env.AI_REPORT_BASE_URL = "http://localhost:11434/v1";
    const { callOpenAiCompatible } = await import("@/lib/aiSummaryServer");
    globalThis.fetch = (async () => new Response(JSON.stringify(body("{", "length")), { status: 200 })) as typeof fetch;
    expect((await callOpenAiCompatible("s", "u", "m")).stopReason).toBe("max_tokens");
    globalThis.fetch = (async () => new Response(JSON.stringify(body("", "content_filter")), { status: 200 })) as typeof fetch;
    expect((await callOpenAiCompatible("s", "u", "m")).stopReason).toBe("refusal");
    globalThis.fetch = realFetch;
  });

  it("says when the free allowance is used up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.AI_REPORT_BASE_URL = "https://api.groq.example/openai/v1";
    globalThis.fetch = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
    const { callOpenAiCompatible } = await import("@/lib/aiSummaryServer");
    await expect(draftSummary(facts, callOpenAiCompatible, "m", 1)).rejects.toThrow(/free allowance is used up/);
    globalThis.fetch = realFetch;
  });

  it("says the address or model is wrong on a 404, and logs why without the key", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.AI_REPORT_BASE_URL = "https://api.groq.example";
    globalThis.fetch = (async () => new Response('{"error":{"message":"The model `nope` does not exist. Key gsk_abcdefghijk1234"}}', { status: 404 })) as typeof fetch;
    const { callOpenAiCompatible } = await import("@/lib/aiSummaryServer");
    await expect(draftSummary(facts, callOpenAiCompatible, "nope", 1)).rejects.toThrow(/address or model/);
    const logged = String((log.mock.calls[0]?.[1] as Error).message);
    expect(logged).toContain("does not exist");
    expect(logged).toContain("/chat/completions");
    expect(logged).not.toContain("gsk_abcdefghijk1234");
    globalThis.fetch = realFetch;
  });

  it("turns an auth error into the set-up message, not the service's words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.AI_REPORT_BASE_URL = "https://api.groq.example/openai/v1";
    globalThis.fetch = (async () => new Response("bad key gsk_secret", { status: 401 })) as typeof fetch;
    const { callOpenAiCompatible } = await import("@/lib/aiSummaryServer");
    const error = await draftSummary(facts, callOpenAiCompatible, "m", 1).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/isn't set up correctly/);
    expect((error as Error).message).not.toMatch(/gsk_/);
    globalThis.fetch = realFetch;
  });
});

describe("which provider is used", () => {
  it("defaults to Anthropic, and an openai-compatible one needs a URL and a model", async () => {
    const m = await import("@/lib/aiSummaryServer");
    delete process.env.AI_REPORT_PROVIDER;
    process.env.ANTHROPIC_API_KEY = "k";
    expect(m.summaryProvider()).toBe("anthropic");
    expect(m.aiConfigured()).toBe(true);
    process.env.AI_REPORT_PROVIDER = "openai-compatible";
    process.env.AI_REPORT_BASE_URL = "http://localhost:11434/v1";
    delete process.env.AI_REPORT_MODEL;
    expect(m.aiConfigured()).toBe(false);
    process.env.AI_REPORT_MODEL = "gemma3";
    expect(m.aiConfigured()).toBe(true);
    expect(m.summaryDestination()).toEqual({ provider: "openai-compatible", host: "localhost", local: true });
    process.env.AI_REPORT_BASE_URL = "https://api.groq.com/openai/v1";
    expect(m.summaryDestination()).toEqual({ provider: "openai-compatible", host: "api.groq.com", local: false });
    delete process.env.AI_REPORT_PROVIDER;
    delete process.env.AI_REPORT_BASE_URL;
    delete process.env.AI_REPORT_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
  });
});
