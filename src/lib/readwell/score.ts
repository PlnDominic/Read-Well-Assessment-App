import { bandFor, isScoredItem, type Band, type FormDef, type StrandKey } from "./form";
import { computeFlow, isStoryRecord, scoreOf, type Answers, type PartFlow } from "./flow";

/**
 * Scoring and bands from the guide's "Scoring and bands" section. Each
 * strand is reported separately, never as one total, so the report shows
 * exactly where the child is stuck.
 */

export interface PartScore {
  number: number;
  title: string;
  raw: number;
  max: number;
  /** "skipped": a gate skipped the whole part (NA on paper). */
  status: "scored" | "skipped";
  note: string | null;
}

export interface StrandScore {
  key: StrandKey;
  name: string;
  raw: number;
  max: number;
  band: Band | null;
  /** "na": every part of the strand was skipped by a gate. "notEntered": the writing sheet hasn't been scored yet. */
  status: "scored" | "na" | "notEntered";
  /** Why there's no band, when there isn't one. */
  bandNote: string | null;
  foundation: boolean;
  parts: PartScore[];
}

export interface StoryReading {
  attempted: number;
  errors: number;
  wordsCorrect: number;
  seconds: number;
  /** Words correct per minute; null when no time was recorded. */
  wcpm: number | null;
  outOf: number;
}

export type SupportLevel = "On track for Level 1" | "Needs support" | "Needs urgent support";

export interface FormSummary {
  strands: StrandScore[];
  storyReading: StoryReading | null;
  attitude: { itemId: string; prompt: string; answer: string | null }[];
  supportLevel: SupportLevel;
  /** How many of the six foundation strands are Emerging. */
  emergingFoundation: number;
  /** How many foundation strands have a band; the support level counts these. */
  bandedFoundation: number;
  /** Gate and stop rules that changed what was given, for the report. */
  rulesApplied: string[];
}

export function supportLevelFor(emergingFoundation: number): SupportLevel {
  if (emergingFoundation >= 5) return "Needs urgent support";
  if (emergingFoundation >= 2) return "Needs support";
  return "On track for Level 1";
}

export function scoreForm(form: FormDef, answers: Answers, flows: PartFlow[] = computeFlow(form, answers)): FormSummary {
  const flowOf = (n: number) => flows.find((f) => f.number === n)!;
  const partDef = (n: number) => form.parts.find((p) => p.number === n)!;

  const strands: StrandScore[] = form.strands.map((strand) => {
    const parts: PartScore[] = strand.parts.map((n) => {
      const flow = flowOf(n);
      const items = form.items.filter((i) => i.part === n && isScoredItem(i));
      const max = items.reduce((sum, i) => sum + (i.maxScore ?? 1), 0);
      if (flow.status === "skipped") {
        return { number: n, title: partDef(n).title, raw: 0, max, status: "skipped", note: `NA: ${flow.skipped!.by}` };
      }
      const active = new Set(flow.activeItemIds);
      const raw = items.filter((i) => active.has(i.id)).reduce((sum, i) => sum + (scoreOf(answers, i.id) ?? 0), 0);
      const rule = flow.stopped ?? flow.limited;
      return { number: n, title: partDef(n).title, raw, max, status: "scored", note: rule ? `${rule.by}: ${rule.reason}` : null };
    });

    const raw = parts.reduce((sum, p) => sum + p.raw, 0);
    const base = { key: strand.key, name: strand.name, max: strand.max, foundation: strand.foundation, parts };

    if (parts.every((p) => p.status === "skipped")) {
      return { ...base, raw: 0, band: null, status: "na", bandNote: null };
    }
    if (strand.key === "writing" && !form.items.some((i) => i.part === 13 && scoreOf(answers, i.id) !== undefined)) {
      return { ...base, raw: 0, band: null, status: "notEntered", bandNote: null };
    }
    if (form.baseline && !strand.bandedAtBaseline) {
      return { ...base, raw, band: null, status: "scored", bandNote: "Raw score only: Level 1 hasn't taught this yet." };
    }
    if (!strand.cuts) {
      return { ...base, raw, band: null, status: "scored", bandNote: "Banded by the rung rules in the Sound Awareness Subtest." };
    }
    return { ...base, raw, band: bandFor(raw, strand.cuts), status: "scored", bandNote: null };
  });

  let storyReading: StoryReading | null = null;
  const storyFlow = flowOf(11);
  const recordItem = form.items.find((i) => i.part === 11 && !isScoredItem(i));
  const record = recordItem ? answers[recordItem.id] : undefined;
  const outOf = form.story.lines.join(" ").trim().split(/\s+/).length;
  if (storyFlow.status !== "skipped" && isStoryRecord(record)) {
    const attempted = Math.max(0, record.lastWord + 1);
    const errors = new Set(record.errorWords.filter((w) => w >= 0 && w <= record.lastWord)).size;
    const wordsCorrect = attempted - errors;
    storyReading = {
      attempted,
      errors,
      wordsCorrect,
      seconds: record.seconds,
      wcpm: record.seconds > 0 ? Math.round((wordsCorrect * 60) / record.seconds) : null,
      outOf,
    };
  }

  const attitude = form.items
    .filter((i) => i.part === 12)
    .map((i) => {
      const a = answers[i.id];
      const choice = i.responseChoices?.find((c) => c.value === a);
      return { itemId: i.id, prompt: i.prompt, answer: choice?.label ?? null };
    });

  const foundation = strands.filter((s) => s.foundation);
  const emergingFoundation = foundation.filter((s) => s.band === "Emerging").length;
  const bandedFoundation = foundation.filter((s) => s.band !== null).length;

  const rulesApplied = flows.flatMap((f) => {
    const rule = f.skipped ?? f.stopped ?? f.limited;
    if (!rule) return [];
    const what = f.skipped ? "skipped" : f.stopped ? "stopped early" : "first row only";
    return [`Part ${f.number} ${what}. ${rule.by}: ${rule.reason}`];
  });

  return {
    strands,
    storyReading,
    attitude,
    supportLevel: supportLevelFor(emergingFoundation),
    emergingFoundation,
    bandedFoundation,
    rulesApplied,
  };
}

/** One results row per strand that has a score: percent of the strand's maximum, flagged when Emerging. */
export function strandResultRows(summary: FormSummary): { key: StrandKey; score: number; flagged: boolean }[] {
  return summary.strands
    .filter((s) => s.status === "scored")
    .map((s) => ({ key: s.key, score: Math.round((s.raw / s.max) * 100), flagged: s.band === "Emerging" }));
}
