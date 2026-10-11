import { describe, expect, it } from "vitest";
import { FORM_OPTIONS, LEVEL_OPTIONS, formLabel, isAssessmentForm, isValidLevel, levelLabel, parseLevel } from "./levels";

describe("levels", () => {
  it("labels levels and forms", () => {
    expect(levelLabel(1)).toBe("Level 1");
    expect(FORM_OPTIONS.map(formLabel)).toEqual(["Form A", "Form B", "Form C", "Final assessment"]);
  });

  it("starts at Level 1", () => {
    expect(LEVEL_OPTIONS[0]).toBe(1);
    expect(isValidLevel(0)).toBe(false);
    expect(isValidLevel(-1)).toBe(false);
  });

  it("recognises the four forms only", () => {
    expect(isAssessmentForm("Final")).toBe(true);
    expect(isAssessmentForm("D")).toBe(false);
    expect(isAssessmentForm("a")).toBe(false);
  });
});

describe("parseLevel", () => {
  it.each([
    ["1", 1],
    ["Level 2", 2],
    ["level2", 2],
    ["L3", 3],
    ["lvl 4", 4],
  ])("reads %j", (raw, level) => {
    expect(parseLevel(raw)).toBe(level);
  });

  it.each(["", "0", "-1", "KG1", "Grade 1", "99", "one"])("rejects %j", (raw) => {
    expect(parseLevel(raw)).toBeNull();
  });
});
