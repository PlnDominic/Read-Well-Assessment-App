import type { AssessmentItem } from "@/lib/database.types";

/**
 * Shape of a ReadWell assessor-led form (the Level 1 baseline, Form A, is
 * the first: src/lib/readwell/level1FormA.ts). The item bank is the flat
 * `items` list, which is also what the database stores in
 * assessments.items; everything else here is the guide's structure around
 * those items (scripts, rules, strands, bands), keyed by part number.
 *
 * Kept free of server-only imports: the assessor screen renders from it in
 * the browser.
 */

export type StrandKey =
  | "storyListening"
  | "vocabulary"
  | "printConcepts"
  | "soundAwareness"
  | "letterNames"
  | "letterSounds"
  | "wordReading"
  | "heartWords"
  | "storyQuestions"
  | "writing";

export type Band = "Emerging" | "Developing" | "Secure" | "Advanced";

export type PartKind = "questions" | "vocabulary" | "grid" | "ladder" | "story" | "attitude" | "writing";

/** One line of a part's script: `say` is read to the child word for word (bold in the guide); `do` is for the assessor. */
export interface ScriptLine {
  say?: string;
  do?: string;
}

export interface PartDef {
  number: number;
  code: string;
  title: string;
  kind: PartKind;
  /** Which strand the part's items count toward; null for the unscored reading attitude part. */
  strand: StrandKey | null;
  stimulus: string;
  script: ScriptLine[];
  /** Bullets shown under the script: what to say when, stop rules, scoring notes. */
  notes: string[];
  /** Practice item, taught but never scored or stored. */
  practice?: string;
  /** Per-letter accept rules (letter sounds). */
  acceptTable?: { letter: string; accept: string }[];
  /** Shown once the part's items are done, e.g. "After Part 7, check Gate B." */
  after?: string;
  /** Part 13 is given to a small group on paper and scored afterwards. */
  groupOnPaper?: boolean;
}

export interface StrandDef {
  key: StrandKey;
  name: string;
  parts: number[];
  max: number;
  /** Lowest raw score for Developing, Secure and Advanced; below the first is Emerging. null when the guide sets no band (sound awareness is banded by the subtest's rung rules). */
  cuts: [number, number, number] | null;
  /** One of the six strands the baseline support level counts. */
  foundation: boolean;
  /** At baseline, strands Level 1 hasn't taught yet are shown as raw scores only. */
  bandedAtBaseline: boolean;
}

export interface FormDef {
  /** Prefix of every item code, e.g. "L1A" (Level 1, Form A). */
  id: string;
  title: string;
  /** The students.grade / assessments.grade_level this form is for. */
  gradeLevel: number;
  /** Baseline forms band only the strands Level 1 has taught (see StrandDef.bandedAtBaseline). */
  baseline: boolean;
  intro: {
    kit: string[];
    beforeYouBegin: string[];
    opening: string;
    rules: string[];
    gates: { gate: string; check: string; ifTrue: string }[];
    tiredNote: string;
  };
  parts: PartDef[];
  strands: StrandDef[];
  story: { title: string; lines: string[] };
  items: AssessmentItem[];
}

/** The story reading record (Part 11): words attempted, errors and time, stored as one response. */
export interface StoryRecord {
  /** Index (0-based, across the whole story) of every word read wrongly or skipped. */
  errorWords: number[];
  /** Index of the last word attempted (the bracket); -1 if none. */
  lastWord: number;
  seconds: number;
}

export function isAssessorLed(items: readonly Pick<AssessmentItem, "type">[]): boolean {
  return items.length > 0 && items.every((i) => i.type === "assessor");
}

export function itemMaxScore(item: AssessmentItem): number {
  return item.maxScore ?? 1;
}

export function isScoredItem(item: AssessmentItem): boolean {
  return item.scored !== false;
}

/** "L1A.LS.07" -> "LS7", "L1A.SA.1.1" -> "SA1.1", "L1A.ST.READ" -> "ST": the codes the score sheet uses. */
export function shortCode(itemId: string): string {
  const [, strand = "", ...rest] = itemId.split(".");
  if (rest.length === 0) return strand;
  if (rest.length === 1) return /^\d+$/.test(rest[0]) ? `${strand}${Number(rest[0])}` : strand;
  return `${strand}${rest.join(".")}`;
}

export function storyWordCounts(lines: string[]): number[] {
  return lines.map((l) => l.trim().split(/\s+/).length);
}

/** Line number (1-based) of a word index across the story; 0 when the index is before the first word. */
export function lineOfWord(lines: string[], wordIndex: number): number {
  if (wordIndex < 0) return 0;
  let total = 0;
  const counts = storyWordCounts(lines);
  for (let i = 0; i < counts.length; i++) {
    total += counts[i];
    if (wordIndex < total) return i + 1;
  }
  return counts.length;
}

export function bandFor(raw: number, cuts: [number, number, number]): Band {
  if (raw >= cuts[2]) return "Advanced";
  if (raw >= cuts[1]) return "Secure";
  if (raw >= cuts[0]) return "Developing";
  return "Emerging";
}
