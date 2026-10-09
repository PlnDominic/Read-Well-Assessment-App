/**
 * Grades are stored as integers (students.grade, assessments.grade_level).
 * Kindergarten sits below Grade 1 so ordering still works: KG 1 is -1 and
 * KG 2 is 0. Everywhere a grade is shown to a person goes through
 * gradeLabel() rather than printing "Grade {n}".
 */

export const KG1 = -1;
export const KG2 = 0;

/** Every grade a student can be enrolled in, in order. */
export const GRADE_OPTIONS: readonly number[] = [KG1, KG2, ...Array.from({ length: 12 }, (_, i) => i + 1)];

export function gradeLabel(grade: number): string {
  if (grade === KG1) return "KG 1";
  if (grade === KG2) return "KG 2";
  return `Grade ${grade}`;
}

export function isValidGrade(grade: number): boolean {
  return GRADE_OPTIONS.includes(grade);
}

/**
 * Reads a grade typed by a person (the roster CSV import): "KG1", "KG 1",
 * "K1" and "Kindergarten 1" are KG 1, likewise for 2, and "1".."12" (or
 * "Grade 3", "P3", "B3") are those grades. Returns null for anything else.
 */
export function parseGrade(raw: string): number | null {
  // Drop spaces, and a "-" or "_" only between a letter and a digit
  // ("KG-1"), so "-1" isn't read as Grade 1.
  const s = raw.trim().toLowerCase().replace(/\s+/g, "").replace(/([a-z])[-_]+(?=\d)/g, "$1");
  const kg = /^(?:kg|k|kindergarten)([12])$/.exec(s);
  if (kg) return kg[1] === "1" ? KG1 : KG2;
  const g = /^(?:grade|gr|g|primary|p|basic|b)?(\d{1,2})$/.exec(s);
  if (!g) return null;
  const n = Number(g[1]);
  return n >= 1 && n <= 12 ? n : null;
}
