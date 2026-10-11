/**
 * Students are placed in ReadWell levels (students.level), and each level
 * has four assessments: Form A, Form B, Form C and the Final assessment
 * (assessments.level + assessments.form). The teacher picks which of the
 * four a child takes each time.
 */

export const MAX_LEVEL = 6;

/** Every level a student can be placed in, in order. Raise MAX_LEVEL when the programme adds levels. */
export const LEVEL_OPTIONS: readonly number[] = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

export type AssessmentForm = "A" | "B" | "C" | "Final";

export const FORM_OPTIONS: readonly AssessmentForm[] = ["A", "B", "C", "Final"];

export function levelLabel(level: number): string {
  return `Level ${level}`;
}

export function formLabel(form: AssessmentForm): string {
  return form === "Final" ? "Final assessment" : `Form ${form}`;
}

export function isValidLevel(level: number): boolean {
  return LEVEL_OPTIONS.includes(level);
}

export function isAssessmentForm(value: unknown): value is AssessmentForm {
  return typeof value === "string" && (FORM_OPTIONS as readonly string[]).includes(value);
}

/**
 * Reads a level typed by a person (the roster CSV import): "2", "Level 2",
 * "L2" and "lvl 2" are all Level 2. Returns null for anything that isn't a
 * level in LEVEL_OPTIONS.
 */
export function parseLevel(raw: string): number | null {
  const m = /^(?:level|lvl|l)?\s*(\d{1,2})$/i.exec(raw.trim());
  if (!m) return null;
  const level = Number(m[1]);
  return isValidLevel(level) ? level : null;
}
