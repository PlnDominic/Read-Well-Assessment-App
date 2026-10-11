/**
 * What Sunny says aloud in the student game. Item lines come from the item
 * itself; the rest are his reactions, listed here so each one can be
 * recorded (public/voice, src/lib/voice.ts). Change a line here and its
 * recording stops matching, so Sunny falls back to the device's voice for it
 * until it's recorded again (spoken.test.ts says which).
 */

/** The parts of an item that decide what's spoken. */
export interface SpokenItem {
  type: string;
  prompt: string;
  passage?: string | null;
  say?: string | null;
}

/**
 * What Sunny reads out for an item: its `say` if it has one, otherwise the
 * passage and prompt. A read-aloud item never reads its passage, which is
 * what the child is meant to read themselves.
 */
export function itemSpokenText(item: SpokenItem): string {
  if (item.say) return item.say;
  return item.type === "mic" ? item.prompt : [item.passage, item.prompt].filter(Boolean).join(". ");
}

/** Sunny's reactions: every line the game speaks that isn't an item's own. */
export const REACTION_LINES = {
  right: "That's right!",
  solved: "You got it!",
  wrong: "Not quite. Try again!",
  revealed: "That's okay. It's this one!",
  missionComplete: "Mission complete! Great job!",
} as const;
