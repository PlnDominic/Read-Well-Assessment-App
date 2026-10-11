import type { AssessmentItem } from "@/lib/database.types";
import { partFor, type Part } from "@/lib/gameParts";

/**
 * Editing a game form's questions (Admin → Content → game editor): ids,
 * mission grouping and the checks a form must pass before it's published.
 * The server runs the same checks (saveAssessmentItems), so the editor can
 * point at the question that needs fixing instead of failing the save.
 */

export type GameItemType = "choice" | "mic" | "text";

export const GAME_ITEM_TYPES: readonly GameItemType[] = ["choice", "mic", "text"];

/**
 * The next free id in a part: VO07 after VO01 to VO06. The prefix is what
 * puts a question in its mission (gameParts.ts), so an id is never random.
 */
export function nextItemId(items: readonly { id: string }[], code: string): string {
  const pattern = new RegExp(`^${code}(\\d+)$`, "i");
  let max = 0;
  for (const item of items) {
    const m = pattern.exec(item.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${code}${String(max + 1).padStart(2, "0")}`;
}

export interface PartGroup {
  /** null for questions whose id matches no part (made before ids carried one). */
  part: Part | null;
  /** Positions in the items array, in order. */
  indexes: number[];
}

/** Every part of the level, in order, with its questions (possibly none), then any questions with no part. */
export function groupByPart(items: readonly { id: string }[], parts: readonly Part[]): PartGroup[] {
  const groups: PartGroup[] = parts.map((part) => ({ part, indexes: [] }));
  const other: PartGroup = { part: null, indexes: [] };
  items.forEach((item, index) => {
    const part = partFor(parts, item);
    (part ? groups[parts.indexOf(part)] : other).indexes.push(index);
  });
  return other.indexes.length > 0 ? [...groups, other] : groups;
}

/**
 * The items in mission order: each part's questions together, parts in
 * order, questions with no part last. The game makes a mission of each run
 * of one part's questions, so a part split in two would be two missions.
 */
export function orderByPart<T extends { id: string }>(items: readonly T[], parts: readonly Part[]): T[] {
  return groupByPart(items, parts).flatMap((group) => group.indexes.map((i) => items[i]));
}

export interface ItemProblem {
  /** The question's position, or -1 for the form as a whole. */
  index: number;
  message: string;
}

/** What stops a game form being published, worded for the person editing it. */
export function validateGameItems(items: readonly AssessmentItem[]): ItemProblem[] {
  if (items.length === 0) return [{ index: -1, message: "Add at least one question." }];
  const problems: ItemProblem[] = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const problem = (message: string) => problems.push({ index, message });
    if (!item.id.trim()) problem("This question has no id.");
    else if (seen.has(item.id.toUpperCase())) problem(`Another question already uses the id ${item.id}.`);
    seen.add(item.id.toUpperCase());
    if (!GAME_ITEM_TYPES.includes(item.type as GameItemType)) problem("Pick what kind of question this is.");
    if (!item.prompt.trim()) problem("Write the question the child sees.");
    if (!item.skillAreaKey) problem("Pick a skill area.");
    if (item.type === "choice") {
      const options = item.options ?? [];
      if (options.length < 2) problem("Give at least two answers to tap.");
      else if (options.some((o) => !o.text.trim())) problem("One of the answers is empty.");
      if (options.length >= 2 && !options.some((o) => o.isCorrect)) problem("Mark which answer is right.");
    }
  });
  return problems;
}
