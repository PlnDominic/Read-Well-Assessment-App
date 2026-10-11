/**
 * A game choice can start with a picture, so children who can't read yet
 * can still answer: a leading emoji ("🐐 A goat", or just "🐏") is drawn
 * from public/pictures/<code points>.svg (Twemoji, so it looks the same on
 * every tablet, however old its emoji font), and a leading :name:
 * (":mop:") from public/pictures/<name>.svg. The option's text, picture
 * and all, is still what's stored as the answer.
 */
export interface OptionPicture {
  /** Path of the picture under public/, or null for a plain text option. */
  src: string | null;
  /** The emoji itself, shown as text if its picture file is missing. */
  emoji: string | null;
  /** The words after the picture ("A goat"), possibly empty. */
  label: string;
}

const TOKEN = /^:([a-z0-9-]+):\s*/;
const EMOJI = /^(\p{Extended_Pictographic}(?:️|⃣|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*)\s*/u;

/** Twemoji's file name for an emoji: its code points in hex, without FE0F unless it's a ZWJ sequence. */
export function emojiFile(emoji: string): string {
  const chars = emoji.includes("‍") ? emoji : emoji.replace(/️/g, "");
  return [...chars].map((c) => c.codePointAt(0)!.toString(16)).join("-");
}

export function optionPicture(text: string): OptionPicture {
  const token = TOKEN.exec(text);
  if (token) return { src: `/pictures/${token[1]}.svg`, emoji: null, label: text.slice(token[0].length) };
  const emoji = EMOJI.exec(text);
  if (emoji) return { src: `/pictures/${emojiFile(emoji[1])}.svg`, emoji: emoji[1], label: text.slice(emoji[0].length) };
  return { src: null, emoji: null, label: text };
}
