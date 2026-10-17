import { describe, expect, it } from "vitest";
import { classToken, cycleFactsMessage, fillClassNames, parseCycleSummary, type CycleFacts } from "@/lib/cycleSummary";
import { collectCycleFacts, draftCycleSummary } from "@/lib/cycleSummaryServer";
import type { CallModel } from "@/lib/aiSummaryServer";

const answer = {
  headline: "Most children are ready to begin Level 1.",
  overview: "Children know their letters well. {{class:B}} needs the most help with letter sounds.",
  strengths: ["Naming letters"],
  priorities: [{ title: "Letter sounds", text: "A daily ten-minute lesson." }],
  actions: ["Give {{class:B}} an extra letter sounds group.", "Share sound games with {{class:Q}}."],
};

describe("parseCycleSummary", () => {
  it("accepts an answer of the right shape", () => {
    expect(parseCycleSummary(answer)).toEqual(answer);
  });

  it("rejects a summary with no priorities or next steps, or a priority without a title", () => {
    expect(parseCycleSummary({ ...answer, priorities: [] })).toBeNull();
    expect(parseCycleSummary({ ...answer, actions: [] })).toBeNull();
    expect(parseCycleSummary({ ...answer, priorities: [{ title: "", text: "x" }] })).toBeNull();
    expect(parseCycleSummary({ headline: "only this" })).toBeNull();
  });
});

describe("class labels", () => {
  it("are letters, then letters with a number", () => {
    expect(classToken(0)).toBe("{{class:A}}");
    expect(classToken(25)).toBe("{{class:Z}}");
    expect(classToken(26)).toBe("{{class:A1}}");
  });

  it("become the class's name, and a made-up one becomes 'one class'", () => {
    const filled = fillClassNames(parseCycleSummary(answer)!, { "{{class:B}}": "Ms Rivera's class" });
    expect(filled.overview).toContain("Ms Rivera's class needs the most help");
    expect(filled.actions).toEqual(["Give Ms Rivera's class an extra letter sounds group.", "Share sound games with one class."]);
  });
});

// A just-enough stand-in for the admin client, answering by table and
// recording the filters each query was given.
function fakeAdmin(tables: Record<string, unknown>, counts: Record<string, number> = {}) {
  const filters: string[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is"]) {
      b[m] = (...args: unknown[]) => {
        if (m !== "select") filters.push(`${table}.${m}(${args.map(String).join(",")})`);
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table], count: counts[table] ?? null, error: null });
    return b;
  };
  return { admin: { from: (table: string) => builder(table) } as never, filters };
}

describe("collectCycleFacts", () => {
  const sessions = [
    { id: "s1", student_id: "c1", students: { teacher_id: "t1", profiles: { name: "Ms Rivera" } }, assessments: { level: 1 } },
    { id: "s2", student_id: "c2", students: { teacher_id: "t1", profiles: { name: "Ms Rivera" } }, assessments: { level: 1 } },
    { id: "s3", student_id: "c3", students: { teacher_id: "t2", profiles: { name: "Mr Owusu" } }, assessments: { level: 1 } },
  ];
  const results = [
    { session_id: "s1", score: 40, flagged_as_difficulty: true, skill_areas: { id: "k1", name: "Letter sounds" } },
    { session_id: "s2", score: 90, flagged_as_difficulty: false, skill_areas: { id: "k1", name: "Letter sounds" } },
    { session_id: "s3", score: 20, flagged_as_difficulty: true, skill_areas: { id: "k1", name: "Letter sounds" } },
  ];
  const tables = {
    assessment_sessions: sessions,
    results,
    student_reports: [{ session_id: "s1", overall_label: "Needs support" }],
    recommendation_rules: [{ skill_area_id: "k1", recommendation_text: "Teach two sounds a week.", program_reference: null, skill_areas: { name: "Letter sounds" } }],
    school_skill_weights: [],
  };

  it("adds up the cycle with no child, teacher or school named, and labels the classes", async () => {
    const { admin } = fakeAdmin(tables, { students: 30 });
    const collected = await collectCycleFacts(admin, { schoolId: "school-1", cycleId: "cycle-1", teacherId: null });
    const { facts, classNames } = collected!;
    expect(facts).toMatchObject({ scope: "the whole school", assessments: 3, childrenAssessed: 3, childrenOnRoll: 30 });
    expect(facts.skills).toEqual([{ level: 1, skill: "Letter sounds", assessments: 3, averagePercent: 50, flaggedPercent: 67 }]);
    // s1's report says "Needs support"; s2 and s3 have no report yet, and one flag or none is On Track.
    expect(facts.levels[0].results).toEqual([
      { label: "Needs support", assessments: 1 },
      { label: "On Track", assessments: 2 },
    ]);
    expect(facts.recommendations).toEqual([{ level: 1, skill: "Letter sounds", text: "Teach two sounds a week." }]);
    expect(facts.classes?.map((c) => c.class)).toEqual(["{{class:A}}", "{{class:B}}"]);
    expect(Object.values(classNames).sort()).toEqual(["Mr Owusu's class", "Ms Rivera's class"]);
    const sent = cycleFactsMessage(facts);
    for (const secret of ["Rivera", "Owusu", "c1", "s1", "school-1", "cycle-1"]) expect(sent).not.toContain(secret);
  });

  it("keeps to one class, without class labels", async () => {
    const { admin, filters } = fakeAdmin(tables, { students: 12 });
    const collected = await collectCycleFacts(admin, { schoolId: "school-1", cycleId: "cycle-1", teacherId: "t1" });
    expect(collected!.facts.scope).toBe("one class");
    expect(collected!.facts.classes).toBeUndefined();
    expect(filters).toContain("assessment_sessions.eq(students.teacher_id,t1)");
    expect(filters).toContain("students.eq(teacher_id,t1)");
  });

  it("is null when nothing is finished yet", async () => {
    const { admin } = fakeAdmin({ ...tables, assessment_sessions: [] });
    expect(await collectCycleFacts(admin, { schoolId: "school-1", cycleId: "cycle-1", teacherId: null })).toBeNull();
  });
});

describe("draftCycleSummary", () => {
  it("asks in the cycle summary's shape", async () => {
    const facts: CycleFacts = { scope: "one class", assessments: 1, childrenAssessed: 1, childrenOnRoll: 1, levels: [], skills: [], recommendations: [] };
    let format: Parameters<CallModel>[3] | undefined;
    const call: CallModel = async (_s, _u, _m, f) => {
      format = f;
      return { text: JSON.stringify(answer), stopReason: "end_turn", model: "m" };
    };
    const { content } = await draftCycleSummary(facts, call, "m", 1);
    expect(content.priorities).toHaveLength(1);
    expect(format?.instruction).toContain('"priorities"');
  });
});
