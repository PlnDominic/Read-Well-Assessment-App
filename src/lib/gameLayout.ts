import type { OptionPicture } from "@/lib/optionPicture";

/**
 * How the student game lays out a question, shared with the admin's
 * preview of it (Admin → Content → game editor) so the two never differ.
 */

/** Pictures (and single letters or marks) show as big tiles a child can tap; anything wordier stays a list. */
export function showAsTiles(pictures: readonly OptionPicture[]): boolean {
  return pictures.length > 0 && pictures.every((p) => (p.src ? !p.label : p.label.length <= 3));
}

/** A single word to read aloud shows big, like a flash card. */
export function isWordCard(item: { type: string; passage?: string | null }): boolean {
  return item.type === "mic" && !!item.passage && item.passage.length <= 14;
}
