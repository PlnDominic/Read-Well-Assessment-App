import { describe, expect, it } from "vitest";
import { GRADE_OPTIONS, KG1, KG2, gradeLabel, isValidGrade, parseGrade } from "./grades";

describe("gradeLabel", () => {
  it("names kindergarten years and numbered grades", () => {
    expect(gradeLabel(KG1)).toBe("KG 1");
    expect(gradeLabel(KG2)).toBe("KG 2");
    expect(gradeLabel(1)).toBe("Grade 1");
  });
});

describe("GRADE_OPTIONS", () => {
  it("lists KG 1 and KG 2 before Grade 1 through 12", () => {
    expect(GRADE_OPTIONS.map(gradeLabel).slice(0, 3)).toEqual(["KG 1", "KG 2", "Grade 1"]);
    expect(GRADE_OPTIONS).toHaveLength(14);
    expect(isValidGrade(-2)).toBe(false);
    expect(isValidGrade(13)).toBe(false);
  });
});

describe("parseGrade", () => {
  it.each([
    ["KG1", KG1],
    ["kg 1", KG1],
    ["K1", KG1],
    ["Kindergarten 1", KG1],
    ["KG2", KG2],
    ["1", 1],
    ["Grade 3", 3],
    ["P2", 2],
    ["B6", 6],
    ["12", 12],
  ])("reads %j", (raw, grade) => {
    expect(parseGrade(raw)).toBe(grade);
  });

  it.each(["", "0", "13", "KG3", "first", "-1"])("rejects %j", (raw) => {
    expect(parseGrade(raw)).toBeNull();
  });
});
