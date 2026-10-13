import { describe, expect, it } from "vitest";
import { LEVEL_PARTS } from "@/lib/gameParts";
import { STOP_AFTER_WRONG, stopReachedAt, stopsFor } from "@/lib/gameStop";

const parts = LEVEL_PARTS[1];
const item = (id: string, skillAreaKey = "letterNames") => ({ id, skillAreaKey });
// Part 5 (letter names, LN) has five questions here, then Part 6 (LS).
const items = [...["LN01", "LN02", "LN03", "LN04", "LN05"].map((id) => item(id)), item("LS01", "letterSounds"), item("LS02", "letterSounds")];
const scored = (marks: Record<string, boolean>) => new Map(Object.entries(marks));

describe("the stop rule", () => {
  it(`ends a part after ${STOP_AFTER_WRONG} wrong in a row, and resumes at the next part`, () => {
    const marks = scored({ LN01: false, LN02: false, LN03: false });
    expect(stopReachedAt(items, parts, marks, 2)).toMatchObject({ afterIndex: 2, resumeAt: 5 });
  });

  it("waits for three in a row", () => {
    expect(stopReachedAt(items, parts, scored({ LN01: false, LN02: false }), 1)).toBeNull();
    expect(stopReachedAt(items, parts, scored({ LN01: false, LN02: true, LN03: false, LN04: false }), 3)).toBeNull();
    expect(stopReachedAt(items, parts, scored({ LN01: true, LN02: false, LN03: false, LN04: false }), 3)).toMatchObject({ resumeAt: 5 });
  });

  it("fires only on the answer that completes the run", () => {
    const marks = scored({ LN01: false, LN02: false, LN03: false, LN04: false });
    expect(stopReachedAt(items, parts, marks, 3)).toBeNull();
  });

  it("does not stop on the last question of a part, or in a part of fewer than five", () => {
    const wrong = scored({ LN01: false, LN02: false, LN03: false, LN04: false, LN05: false });
    expect(stopReachedAt(items, parts, wrong, 4)).toBeNull();
    expect(stopReachedAt(items, parts, scored({ LS01: false, LS02: false }), 6)).toBeNull();
  });

  it("never stops reading attitude, which has no wrong answer", () => {
    const at = Array.from({ length: 5 }, (_, i) => item(`AT0${i + 1}`, "readingAttitude"));
    expect(stopReachedAt(at, parts, scored({ AT01: false, AT02: false, AT03: false }), 2)).toBeNull();
  });

  it("finds every part a child stopped in, for the report", () => {
    const marks = scored({ LN01: true, LN02: false, LN03: false, LN04: false });
    expect(stopsFor(items, parts, marks).map((s) => [s.part.code, s.afterIndex])).toEqual([["LN", 3]]);
    expect(stopsFor(items, parts, scored({ LN01: false, LN02: false }))).toEqual([]);
  });
});
