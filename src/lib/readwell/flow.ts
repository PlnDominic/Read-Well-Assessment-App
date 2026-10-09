import type { AssessmentItem } from "@/lib/database.types";
import { isScoredItem, storyWordCounts, type FormDef, type StoryRecord } from "./form";

/**
 * The guide's gate and stop rules as one pure function of the marks made
 * so far. The assessor screen uses it to decide what comes next, and
 * scoring uses the same result to know which items count, so the two can
 * never disagree about a child who was moved on by a gate.
 *
 * A mark is the stored answer for an item: a number (the score) for
 * scored items, a choice value for reading attitude, and a StoryRecord for
 * the story reading record. No answer means not marked yet.
 */

export type Answers = Record<string, unknown>;

export type PartStatus = "todo" | "in_progress" | "complete" | "skipped";

export interface PartFlow {
  number: number;
  status: PartStatus;
  /** The items the assessor marks in this part: every item, minus rows a gate or stop rule took away. */
  activeItemIds: string[];
  /** Set when the whole part is skipped. */
  skipped?: { by: string; reason: string };
  /** Set when the part ended early: a stop rule, or Gates C, D and E. */
  stopped?: { by: string; reason: string };
  /** Set when only part of the part is given (Gate A gives only the first row of Part 10). */
  limited?: { by: string; reason: string };
}

const GATE_A = { by: "Gate A", reason: "The letter sounds score was 4 or less." };
const GATE_B = { by: "Gate B", reason: "The CV blending score was 2 or less." };
const GATE_C = { by: "Gate C", reason: "All 5 words in the first row of Part 8 were wrong." };

export function scoreOf(answers: Answers, itemId: string): number | undefined {
  const a = answers[itemId];
  return typeof a === "number" ? a : undefined;
}

export function isStoryRecord(value: unknown): value is StoryRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return Array.isArray(r.errorWords) && typeof r.lastWord === "number" && typeof r.seconds === "number";
}

function isMarked(answers: Answers, item: AssessmentItem): boolean {
  const a = answers[item.id];
  if (a === undefined || a === null) return false;
  if (!isScoredItem(item) && item.responseChoices) return item.responseChoices.some((c) => c.value === a);
  if (!isScoredItem(item)) return isStoryRecord(a);
  return typeof a === "number";
}

function total(answers: Answers, items: AssessmentItem[]): number {
  return items.reduce((sum, i) => sum + (scoreOf(answers, i.id) ?? 0), 0);
}

function allMarked(answers: Answers, items: AssessmentItem[]): boolean {
  return items.length > 0 && items.every((i) => isMarked(answers, i));
}

function allMarkedWrong(answers: Answers, items: AssessmentItem[]): boolean {
  return allMarked(answers, items) && total(answers, items) === 0;
}

function statusOf(answers: Answers, items: AssessmentItem[]): PartStatus {
  if (allMarked(answers, items)) return "complete";
  return items.some((i) => isMarked(answers, i)) ? "in_progress" : "todo";
}

/** Story lines the child read to the end, from the bracket (the last word attempted). */
export function linesCompleted(lines: string[], lastWord: number): number {
  let end = -1;
  let done = 0;
  for (const count of storyWordCounts(lines)) {
    end += count;
    if (lastWord >= end) done += 1;
    else break;
  }
  return done;
}

/** Words read correctly in the story's first line; null until the child has read past it or stopped. */
function firstLineCorrect(lines: string[], record: StoryRecord): number {
  const firstLineWords = storyWordCounts(lines)[0] ?? 0;
  let correct = 0;
  for (let w = 0; w < firstLineWords; w++) {
    if (w <= record.lastWord && !record.errorWords.includes(w)) correct += 1;
  }
  return correct;
}

export function computeFlow(form: FormDef, answers: Answers): PartFlow[] {
  const itemsOf = (part: number) => form.items.filter((i) => i.part === part);
  const rowsOf = (part: number, maxRow: number) => itemsOf(part).filter((i) => (i.row ?? 1) <= maxRow);
  const flows: PartFlow[] = [];

  const plain = (part: number): PartFlow => {
    const items = itemsOf(part);
    return { number: part, status: statusOf(answers, items), activeItemIds: items.map((i) => i.id) };
  };
  const skippedPart = (part: number, gate: { by: string; reason: string }): PartFlow => ({
    number: part,
    status: "skipped",
    activeItemIds: [],
    skipped: gate,
  });
  /** A grid part whose first `rows` rows, all wrong, end the part. */
  const withStopRule = (part: number, rows: number, stop: { by: string; reason: string }): PartFlow => {
    const firstRows = rowsOf(part, rows);
    if (allMarkedWrong(answers, firstRows)) {
      return { number: part, status: "complete", activeItemIds: firstRows.map((i) => i.id), stopped: stop };
    }
    return plain(part);
  };

  for (const part of [1, 2, 3, 4]) flows.push(plain(part));

  flows.push(withStopRule(5, 2, { by: "Stop rule", reason: "No letter in the first two rows was correct." }));
  const p6 = withStopRule(6, 2, { by: "Stop rule", reason: "No sound in the first two rows was correct." });
  flows.push(p6);

  const lsItems = itemsOf(6).filter((i) => p6.activeItemIds.includes(i.id));
  const gateA = p6.status === "complete" && total(answers, lsItems) <= 4;

  // Part 7
  let gateB = false;
  if (gateA) {
    flows.push(skippedPart(7, GATE_A));
  } else {
    const p7 = plain(7);
    flows.push(p7);
    gateB = p7.status === "complete" && total(answers, itemsOf(7)) <= 2;
  }

  // Part 8
  let gateC = false;
  if (gateA || gateB) {
    flows.push(skippedPart(8, gateA ? GATE_A : GATE_B));
  } else {
    const firstRow = rowsOf(8, 1);
    gateC = allMarkedWrong(answers, firstRow);
    flows.push(
      gateC
        ? { number: 8, status: "complete", activeItemIds: firstRow.map((i) => i.id), stopped: GATE_C }
        : plain(8)
    );
  }

  // Part 9
  if (gateA || gateB || gateC) {
    flows.push(skippedPart(9, gateA ? GATE_A : gateB ? GATE_B : GATE_C));
  } else {
    flows.push(withStopRule(9, 1, { by: "Stop rule", reason: "All 5 words in the first row were wrong." }));
  }

  // Part 10
  {
    const firstRow = rowsOf(10, 1);
    const gateD = allMarkedWrong(answers, firstRow);
    if (gateD) {
      flows.push({
        number: 10,
        status: "complete",
        activeItemIds: firstRow.map((i) => i.id),
        stopped: { by: "Gate D", reason: "All 5 words in the first row were wrong." },
        ...(gateA ? { limited: { by: "Gate A", reason: "Only the first row is given." } } : {}),
      });
    } else if (gateA) {
      flows.push({
        number: 10,
        status: statusOf(answers, firstRow),
        activeItemIds: firstRow.map((i) => i.id),
        limited: { by: "Gate A", reason: "Only the first row is given." },
      });
    } else {
      flows.push(plain(10));
    }
  }

  // Part 11
  if (gateA || gateB || gateC) {
    flows.push(skippedPart(11, gateA ? GATE_A : gateB ? GATE_B : GATE_C));
  } else {
    const items = itemsOf(11);
    const recordItem = items.find((i) => !isScoredItem(i))!;
    const questions = items.filter(isScoredItem);
    const record = answers[recordItem.id];
    if (!isStoryRecord(record)) {
      flows.push({ number: 11, status: "todo", activeItemIds: [recordItem.id, ...questions.map((q) => q.id)] });
    } else if (firstLineCorrect(form.story.lines, record) === 0) {
      flows.push({
        number: 11,
        status: "complete",
        activeItemIds: [recordItem.id],
        stopped: { by: "Gate E", reason: "No word in the first line was read correctly. The questions are not asked." },
      });
    } else {
      const read = linesCompleted(form.story.lines, record.lastWord);
      const asked = questions.filter((q) => (q.fromLine ?? 1) <= read);
      flows.push({
        number: 11,
        status: allMarked(answers, asked) || asked.length === 0 ? "complete" : "in_progress",
        activeItemIds: [recordItem.id, ...asked.map((q) => q.id)],
      });
    }
  }

  flows.push(plain(12));
  flows.push(plain(13));
  return flows;
}

/** The one-to-one parts (1-12), in order; Part 13 is the group writing task. */
export const ONE_TO_ONE_PARTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** The next one-to-one part after `part` that a gate hasn't skipped, or null after the last. */
export function nextPart(flows: PartFlow[], part: number): number | null {
  for (const n of ONE_TO_ONE_PARTS) {
    if (n <= part) continue;
    const f = flows.find((x) => x.number === n);
    if (f && f.status !== "skipped") return n;
  }
  return null;
}

export function previousPart(flows: PartFlow[], part: number): number | null {
  for (const n of [...ONE_TO_ONE_PARTS].reverse()) {
    if (n >= part) continue;
    const f = flows.find((x) => x.number === n);
    if (f && f.status !== "skipped") return n;
  }
  return null;
}

/** True when every one-to-one part is complete or skipped: the session can be finished. */
export function isOneToOneComplete(flows: PartFlow[]): boolean {
  return flows
    .filter((f) => ONE_TO_ONE_PARTS.includes(f.number))
    .every((f) => f.status === "complete" || f.status === "skipped");
}
