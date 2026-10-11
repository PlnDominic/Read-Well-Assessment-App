import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEVEL1_FORM_A_GAME_ITEMS } from "@/lib/readwell/level1FormAGame";
import { REACTION_LINES, itemSpokenText } from "@/lib/spoken";
import { VOICE_CLIPS, recordedClip } from "@/lib/voiceClips";
import { lineKey, normalizeLine } from "@/lib/voiceKey";

const ROOT = path.resolve(import.meta.dirname, "../..");

/**
 * Lines Sunny says that have no recording yet, so he says them in the
 * device's voice. These are the Level 1 writing prompts: the voice service
 * ran out of credits before they were recorded. When one is recorded, add
 * its clip, drop it from here, and this test says so.
 */
const NOT_RECORDED_YET = new Set([
  "Write your name.",
  "Write the letter for the first sound in sun. sun.",
  "Write the letter for the first sound in mango. mango.",
  "Write the letter for the first sound in tap. tap.",
  "Write the letter for the first sound in ball. ball.",
  "Write the letter for the first sound in ink. ink.",
  "Write the word tag. The shirt has a tag. tag.",
  "Write the word peg. Hang the cloth with a peg. peg.",
  "Write the word job. My mother has a job. job.",
  "Write the word bun. I ate a bun. bun.",
  "Write this sentence. The red bus is big. The... red... bus... is... big. The red bus is big.",
]);

describe("lineKey", () => {
  it("ignores whitespace differences, not wording", () => {
    expect(lineKey("Tap  the\n ram. ")).toBe(lineKey("Tap the ram."));
    expect(lineKey("Tap the ram.")).not.toBe(lineKey("Tap the web."));
  });

  it("is stable, since the clip file names depend on it", () => {
    expect(lineKey("That's right!")).toBe("197f42bba72ffe");
    expect(lineKey("Tap the ram.")).toBe("08988e5cefe011");
  });
});

describe("the recorded voice", () => {
  it("has a file for every clip in the manifest, and no stray files", () => {
    const files = readdirSync(path.join(ROOT, "public/voice")).filter((f) => f.endsWith(".mp3"));
    expect(files.sort()).toEqual(Object.keys(VOICE_CLIPS).map((k) => `${k}.mp3`).sort());
  });

  it("files each clip under the key of the text it says", () => {
    for (const [key, text] of Object.entries(VOICE_CLIPS)) {
      expect(lineKey(text), text).toBe(key);
    }
  });

  it("precaches every clip in the service worker, so Sunny talks offline", () => {
    const sw = readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
    for (const key of Object.keys(VOICE_CLIPS)) expect(sw, key).toContain(`"${key}.mp3"`);
  });

  it("finds a recording for each of Sunny's reactions", () => {
    for (const line of Object.values(REACTION_LINES)) {
      expect(recordedClip(line), line).toMatch(/^\/voice\/[0-9a-f]{14}\.mp3$/);
    }
  });

  it("has a recording for every Level 1 line except the known gaps", () => {
    const lines = new Set(LEVEL1_FORM_A_GAME_ITEMS.map((item) => normalizeLine(itemSpokenText(item))));
    const missing = [...lines].filter((line) => recordedClip(line) === null);
    // Reworded a line, or recorded one of the gaps? Update the clips or NOT_RECORDED_YET to match.
    expect(new Set(missing)).toEqual(NOT_RECORDED_YET);
  });

  it("only has clips for text the game still says (nothing is recorded in vain)", () => {
    const say = new Set<string>(Object.values(REACTION_LINES).map(normalizeLine));
    for (const item of LEVEL1_FORM_A_GAME_ITEMS) say.add(normalizeLine(itemSpokenText(item)));
    // "Ba, nana" was recorded for the written "Ba... nana": the sound is the same.
    for (const text of Object.values(VOICE_CLIPS)) expect(say.has(text), text).toBe(true);
  });
});

describe("clip files", () => {
  it("exist where recordedClip says they do", () => {
    for (const text of Object.values(VOICE_CLIPS)) {
      const clip = recordedClip(text);
      expect(clip).not.toBeNull();
      expect(existsSync(path.join(ROOT, "public", clip!)), text).toBe(true);
    }
  });
});
