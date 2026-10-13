import { partFor, type Part } from "@/lib/gameParts";

/**
 * The game's stop rule: the game form of the ReadWell guide's rule that a
 * part ends early when the child plainly can't do it yet. The child isn't
 * asked to keep going through a row of words or letters they can't read.
 *
 * Three wrong answers in a row end a part of five questions or more, and
 * the game moves on to the next mission. The child is never told why (the
 * game never says right from wrong, see the kiosk answer endpoint); they
 * just meet the next mission. Questions left unanswered in a stopped part
 * score as not correct, as the guide's stop rule would leave them. The
 * teacher's report says where the child stopped.
 *
 * A skip ("I can't read this one yet") is a wrong answer here too, and
 * reading attitude has no wrong answer, so it never stops.
 */

export const STOP_AFTER_WRONG = 3;
/** Shorter parts (a three-question story) are over before a rule helps. */
export const STOP_MIN_PART_SIZE = 5;

/** The stop rule's view of the form: which questions are in order, and which part each is in. */
interface StopItem {
  id: string;
  skillAreaKey: string;
}

export interface StopPoint {
  part: Part;
  /** The last question the child answered in the part. */
  afterIndex: number;
  /** The first question after the part; the item count when the part is the last. */
  resumeAt: number;
}

/** The indexes of each part's questions, in order, for the parts that can stop. */
function stoppableParts(items: readonly StopItem[], parts: readonly Part[]): { part: Part; indexes: number[] }[] {
  const byPart = new Map<Part, number[]>();
  items.forEach((item, index) => {
    const part = partFor(parts, item);
    if (!part || item.skillAreaKey === "readingAttitude") return;
    byPart.set(part, [...(byPart.get(part) ?? []), index]);
  });
  return [...byPart].map(([part, indexes]) => ({ part, indexes })).filter((p) => p.indexes.length >= STOP_MIN_PART_SIZE);
}

/**
 * Where a part's stop rule fired, from what's been answered so far:
 * `correctById` holds a question's score once it's been answered.
 * Returns null while the child is still going.
 */
function stopWithin(indexes: readonly number[], items: readonly StopItem[], correctById: ReadonlyMap<string, boolean>): number | null {
  let run = 0;
  for (let p = 0; p < indexes.length; p++) {
    const correct = correctById.get(items[indexes[p]].id);
    if (correct === undefined) return null; // not answered yet: the child hasn't got this far
    run = correct ? 0 : run + 1;
    if (run >= STOP_AFTER_WRONG) return p < indexes.length - 1 ? indexes[p] : null;
  }
  return null;
}

/**
 * The stop point the answer just given to item `index` has reached, or null
 * if the child carries on. Run by the answer endpoint, which alone knows
 * which answers were right.
 */
export function stopReachedAt(
  items: readonly StopItem[],
  parts: readonly Part[],
  correctById: ReadonlyMap<string, boolean>,
  index: number
): StopPoint | null {
  const found = stoppableParts(items, parts).find((p) => p.indexes.includes(index));
  if (!found) return null;
  const at = stopWithin(found.indexes, items, correctById);
  if (at !== index) return null;
  return { part: found.part, afterIndex: index, resumeAt: found.indexes[found.indexes.length - 1] + 1 };
}

/** Every part a child stopped in, for the teacher's report. */
export function stopsFor(items: readonly StopItem[], parts: readonly Part[], correctById: ReadonlyMap<string, boolean>): StopPoint[] {
  const out: StopPoint[] = [];
  for (const { part, indexes } of stoppableParts(items, parts)) {
    const at = stopWithin(indexes, items, correctById);
    if (at !== null) out.push({ part, afterIndex: at, resumeAt: indexes[indexes.length - 1] + 1 });
  }
  return out;
}
