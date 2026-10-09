import { describe, expect, it } from "vitest";
import { LEVEL1_FORM_A as form } from "./level1FormA";
import type { StoryRecord } from "./form";
import { computeFlow, isOneToOneComplete, linesCompleted, nextPart, type Answers } from "./flow";
import { scoreForm, strandResultRows, supportLevelFor } from "./score";

const itemsOf = (part: number, row?: number) =>
  form.items.filter((i) => i.part === part && (row === undefined || i.row === row) && i.scored !== false);

/** Marks every scored item in the given parts with `score`. */
function mark(answers: Answers, parts: number[], score: number): Answers {
  for (const p of parts) for (const i of itemsOf(p)) answers[i.id] = score;
  return answers;
}
/** Marks the first `n` items of a part correct and the rest wrong. */
function markFirstCorrect(answers: Answers, part: number, n: number): Answers {
  itemsOf(part).forEach((i, idx) => (answers[i.id] = idx < n ? 1 : 0));
  return answers;
}
function attitude(answers: Answers): Answers {
  answers["L1A.AT.01"] = 3;
  answers["L1A.AT.02"] = 2;
  answers["L1A.AT.03"] = 1;
  answers["L1A.AT.04"] = "sometimes";
  return answers;
}
const story = (r: StoryRecord) => ({ "L1A.ST.READ": r });
const flowOf = (answers: Answers, n: number) => computeFlow(form, answers).find((f) => f.number === n)!;

/** A child who gets everything right and reads the whole story in 40 seconds. */
function strongChild(): Answers {
  const a = mark({}, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1);
  Object.assign(a, story({ errorWords: [], lastWord: 39, seconds: 40 }));
  for (const q of itemsOf(11)) a[q.id] = 1;
  return attitude(a);
}

describe("computeFlow", () => {
  it("gives every part when no gate applies", () => {
    const flows = computeFlow(form, strongChild());
    expect(flows.filter((f) => f.status === "skipped")).toEqual([]);
    expect(isOneToOneComplete(flows)).toBe(true);
    expect(flows.find((f) => f.number === 13)!.status).toBe("todo");
  });

  it("is not complete until every one-to-one part is marked", () => {
    const a = strongChild();
    delete a["L1A.CP.10"];
    expect(isOneToOneComplete(computeFlow(form, a))).toBe(false);
  });

  it("Gate A: letter sounds 4 or less skips 7, 8, 9 and 11 and gives only row 1 of Part 10", () => {
    const a = mark({}, [1, 2, 3, 4, 5], 1);
    markFirstCorrect(a, 6, 4);
    const flows = computeFlow(form, a);
    for (const n of [7, 8, 9, 11]) expect(flows.find((f) => f.number === n)!.skipped?.by).toBe("Gate A");
    const p10 = flows.find((f) => f.number === 10)!;
    expect(p10.limited?.by).toBe("Gate A");
    expect(p10.activeItemIds).toEqual(itemsOf(10, 1).map((i) => i.id));
    expect(nextPart(flows, 6)).toBe(10);
    expect(nextPart(flows, 10)).toBe(12);
  });

  it("Gate A does not apply at 5 letter sounds", () => {
    const a = mark({}, [1, 2, 3, 4, 5], 1);
    markFirstCorrect(a, 6, 5);
    expect(flowOf(a, 7).status).toBe("todo");
  });

  it("Gate A waits until Part 6 is finished", () => {
    const a = mark({}, [1, 2, 3, 4, 5], 1);
    a["L1A.LS.01"] = 0;
    expect(flowOf(a, 7).status).toBe("todo");
  });

  it("the Part 6 stop rule (no sound in the first two rows) ends the part, then Gate A applies", () => {
    const a = mark({}, [1, 2, 3, 4, 5], 1);
    for (const i of [...itemsOf(6, 1), ...itemsOf(6, 2)]) a[i.id] = 0;
    const p6 = flowOf(a, 6);
    expect(p6.status).toBe("complete");
    expect(p6.stopped?.by).toBe("Stop rule");
    expect(p6.activeItemIds).toHaveLength(12);
    expect(flowOf(a, 7).skipped?.by).toBe("Gate A");
  });

  it("the Part 5 stop rule ends letter names after two wrong rows", () => {
    const a: Answers = {};
    for (const i of [...itemsOf(5, 1), ...itemsOf(5, 2)]) a[i.id] = 0;
    const p5 = flowOf(a, 5);
    expect(p5.status).toBe("complete");
    expect(p5.stopped?.by).toBe("Stop rule");
  });

  it("Gate B: CV blending 2 or less skips 8, 9 and 11 and goes to Part 10", () => {
    const a = mark({}, [1, 2, 3, 4, 5, 6], 1);
    markFirstCorrect(a, 7, 2);
    const flows = computeFlow(form, a);
    for (const n of [8, 9, 11]) expect(flows.find((f) => f.number === n)!.skipped?.by).toBe("Gate B");
    expect(nextPart(flows, 7)).toBe(10);
  });

  it("Gate C: a wrong first row stops Part 8 and skips 9 and 11", () => {
    const a = mark({}, [1, 2, 3, 4, 5, 6, 7], 1);
    for (const i of itemsOf(8, 1)) a[i.id] = 0;
    const flows = computeFlow(form, a);
    const p8 = flows.find((f) => f.number === 8)!;
    expect(p8.stopped?.by).toBe("Gate C");
    expect(p8.activeItemIds).toHaveLength(5);
    expect(flows.find((f) => f.number === 9)!.skipped?.by).toBe("Gate C");
    expect(flows.find((f) => f.number === 11)!.skipped?.by).toBe("Gate C");
    expect(nextPart(flows, 8)).toBe(10);
  });

  it("Part 9 stops after a wrong first row", () => {
    const a = mark({}, [1, 2, 3, 4, 5, 6, 7, 8], 1);
    for (const i of itemsOf(9, 1)) a[i.id] = 0;
    expect(flowOf(a, 9).stopped?.by).toBe("Stop rule");
  });

  it("Gate D: a wrong first row stops Part 10", () => {
    const a = mark({}, [1, 2, 3, 4, 5, 6, 7, 8, 9], 1);
    for (const i of itemsOf(10, 1)) a[i.id] = 0;
    const p10 = flowOf(a, 10);
    expect(p10.stopped?.by).toBe("Gate D");
    expect(p10.status).toBe("complete");
  });

  it("Gate E: no word right in the first line stops Part 11 with no questions", () => {
    const a = mark({}, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1);
    Object.assign(a, story({ errorWords: [0, 1, 2, 3, 4, 5], lastWord: 5, seconds: 30 }));
    const p11 = flowOf(a, 11);
    expect(p11.stopped?.by).toBe("Gate E");
    expect(p11.activeItemIds).toEqual(["L1A.ST.READ"]);
    expect(p11.status).toBe("complete");
  });

  it("asks a story question only if the child read its line", () => {
    const a = mark({}, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1);
    // Words 0-17 are lines 1-3; the child stopped at the end of line 3.
    Object.assign(a, story({ errorWords: [2], lastWord: 17, seconds: 120 }));
    const p11 = flowOf(a, 11);
    expect(p11.activeItemIds).toEqual(["L1A.ST.READ", "L1A.STQ.01", "L1A.STQ.02", "L1A.STQ.03"]);
    expect(p11.status).toBe("in_progress");
  });

  it("ignores marks in a part a gate later skipped", () => {
    const a = strongChild();
    markFirstCorrect(a, 6, 3); // letter sounds changed to 3: Gate A
    const summary = scoreForm(form, a);
    expect(summary.strands.find((s) => s.key === "wordReading")!.status).toBe("na");
    expect(summary.strands.find((s) => s.key === "heartWords")!.raw).toBe(5);
    expect(summary.storyReading).toBeNull();
  });
});

describe("linesCompleted", () => {
  it("counts only lines read to the end", () => {
    expect(linesCompleted(form.story.lines, -1)).toBe(0);
    expect(linesCompleted(form.story.lines, 4)).toBe(0);
    expect(linesCompleted(form.story.lines, 5)).toBe(1);
    expect(linesCompleted(form.story.lines, 39)).toBe(7);
  });
});

describe("scoreForm", () => {
  it("scores a strong child: foundation strands banded, the rest raw at baseline", () => {
    const s = scoreForm(form, strongChild());
    const byKey = Object.fromEntries(s.strands.map((x) => [x.key, x]));
    expect(byKey.letterSounds).toMatchObject({ raw: 26, max: 26, band: "Advanced", status: "scored" });
    expect(byKey.soundAwareness).toMatchObject({ raw: 45, band: null });
    expect(byKey.soundAwareness.bandNote).toMatch(/rung rules/);
    expect(byKey.wordReading).toMatchObject({ raw: 40, band: null });
    expect(byKey.wordReading.bandNote).toMatch(/Raw score only/);
    expect(byKey.writing.status).toBe("notEntered");
    expect(s.storyReading).toEqual({ attempted: 40, errors: 0, wordsCorrect: 40, seconds: 40, wcpm: 60, outOf: 40 });
    expect(s.supportLevel).toBe("On track for Level 1");
    expect(s.bandedFoundation).toBe(5);
    expect(s.attitude.map((x) => x.answer)).toEqual(["Happy", "Just okay", "Sad", "Sometimes"]);
    expect(s.rulesApplied).toEqual([]);
  });

  it("computes words correct per minute from attempted minus errors", () => {
    const a = strongChild();
    Object.assign(a, story({ errorWords: [3, 10, 30], lastWord: 29, seconds: 120 }));
    // 30 attempted, 2 errors at or before the bracket (word 30 is after it).
    expect(scoreForm(form, a).storyReading).toMatchObject({ attempted: 30, errors: 2, wordsCorrect: 28, wcpm: 14 });
  });

  it("scores writing once it is entered, out of 15 with the name task worth 2", () => {
    const a = strongChild();
    a["L1A.WT.01"] = 2;
    for (const i of itemsOf(13).slice(1)) a[i.id] = 1;
    a["L1A.WT.14"] = 0;
    expect(scoreForm(form, a).strands.find((s) => s.key === "writing")).toMatchObject({ raw: 14, max: 15, status: "scored" });
  });

  it("names the rules that changed the session", () => {
    const a = mark({}, [1, 2, 3, 4, 5], 1);
    markFirstCorrect(a, 6, 0);
    expect(scoreForm(form, a).rulesApplied).toContain(
      "Part 7 skipped. Gate A: The letter sounds score was 4 or less."
    );
  });

  it("writes results rows as percent of the strand maximum, flagged when Emerging", () => {
    const a = strongChild();
    markFirstCorrect(a, 5, 7); // letter names 7/26: Emerging
    const rows = strandResultRows(scoreForm(form, a));
    expect(rows.find((r) => r.key === "letterNames")).toEqual({ key: "letterNames", score: 27, flagged: true });
    expect(rows.find((r) => r.key === "wordReading")).toEqual({ key: "wordReading", score: 100, flagged: false });
    expect(rows.find((r) => r.key === "writing")).toBeUndefined();
  });
});

describe("supportLevelFor", () => {
  it("follows the guide's table", () => {
    expect([0, 1, 2, 4, 5, 6].map(supportLevelFor)).toEqual([
      "On track for Level 1",
      "On track for Level 1",
      "Needs support",
      "Needs support",
      "Needs urgent support",
      "Needs urgent support",
    ]);
  });
});
