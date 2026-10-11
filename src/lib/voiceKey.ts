/**
 * Sunny's recorded voice is looked up by the exact text he's about to say.
 * The key is a short hash of that text (whitespace tidied), so a clip is
 * found whether the line is built in (src/lib/spoken.ts) or written by an
 * admin, and a line that's been reworded simply has no clip and falls back
 * to the device's voice. Synchronous, with no crypto, so it runs the same in
 * the browser, the tests and the scripts.
 */
export function normalizeLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** cyrb53: a small, well-spread 53-bit string hash, as 14 hex characters. */
export function lineKey(text: string): string {
  const s = normalizeLine(text);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}
