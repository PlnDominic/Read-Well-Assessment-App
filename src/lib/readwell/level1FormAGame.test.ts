import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEVEL1_FORM_A_GAME_ITEMS as ITEMS } from "./level1FormAGame";
import { optionPicture } from "@/lib/optionPicture";
import { LEVEL_PARTS, partFor } from "@/lib/gameParts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

// The guide's thirteen parts, in its order.
const PART_ORDER = ["LC", "VO", "CP", "SA", "LN", "LS", "CV", "RW", "NW", "HW", "ST", "AT", "WT"];

function gameItemsFrom(sql: string): unknown {
  const match = /select 1, 'A', 'game', (?:1|3), '(\[[\s\S]*?\])'::jsonb/.exec(sql);
  if (!match) throw new Error("No Level 1 Form A game insert found");
  return JSON.parse(match[1].replace(/''/g, "'"));
}

const spoken = (item: (typeof ITEMS)[number]) => (item.say ?? item.prompt).toLowerCase();

describe("Level 1 Form A game items", () => {
  it("have unique ids that start with their part code, parts in the guide's order", () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    const parts = ITEMS.map((i) => i.id.slice(0, 2));
    for (const p of parts) expect(PART_ORDER).toContain(p);
    const order = [...new Set(parts)];
    expect(order).toEqual(PART_ORDER);
    // Each part's items sit together, so each part is one mission.
    expect(order.length).toBe(parts.filter((p, i) => i === 0 || p !== parts[i - 1]).length);
  });

  it("keep both stories to three sentences, with three questions each", () => {
    const sentences = (text: string) => text.match(/[^.!?]+[.!?]/g)?.length ?? 0;
    const listening = ITEMS.filter((i) => i.id.startsWith("LC"));
    expect(listening).toHaveLength(3);
    // The story is read aloud at the start of the first question.
    expect(sentences(listening[0].say!.split(" Now answer my questions.")[0].replace("Listen to my story. ", ""))).toBe(3);
    const reading = ITEMS.filter((i) => i.id.startsWith("ST"));
    expect(reading.filter((i) => i.type === "mic")).toHaveLength(3);
    expect(reading.filter((i) => i.type === "choice")).toHaveLength(3);
  });

  it("keep every part short, so a child isn't tired out", () => {
    const counts = new Map<string, number>();
    for (const item of ITEMS) counts.set(item.id.slice(0, 2), (counts.get(item.id.slice(0, 2)) ?? 0) + 1);
    for (const [part, count] of counts) expect(count, part).toBeLessThanOrEqual(6);
    expect(ITEMS.length).toBeLessThanOrEqual(65);
  });

  it("play as seven missions of about ten questions, three sittings", () => {
    const parts = LEVEL_PARTS[1];
    const missions = new Map<string, number>();
    for (const item of ITEMS) {
      const key = partFor(parts, item)!.mission.key;
      missions.set(key, (missions.get(key) ?? 0) + 1);
    }
    expect(missions.size).toBe(7);
    for (const [key, count] of missions) expect(count, key).toBeLessThanOrEqual(10);
    // The first sitting is under thirty questions.
    const first = ITEMS.filter((i) => partFor(parts, i)!.sitting === 1).length;
    expect(first).toBeLessThanOrEqual(30);
  });

  it("are all game items the editor can save", () => {
    for (const item of ITEMS) {
      expect(["choice", "mic", "text"]).toContain(item.type);
      expect(item.prompt.trim()).not.toBe("");
      if (item.type === "choice") {
        const options = item.options ?? [];
        expect(options.length).toBeGreaterThanOrEqual(2);
        expect(new Set(options.map((o) => o.text)).size).toBe(options.length);
        const correct = options.filter((o) => o.isCorrect).length;
        // Reading attitude has no wrong answer; everything else has exactly one right one.
        expect(correct).toBe(item.skillAreaKey === "readingAttitude" ? options.length : 1);
      }
    }
  });

  it("never say the word a child is meant to read or spell", () => {
    for (const item of ITEMS.filter((i) => i.type === "mic")) {
      expect(item.passage).toBeTruthy();
      expect(spoken(item)).not.toMatch(new RegExp(`\\b${item.passage!.toLowerCase().replace(/[.?]/g, "")}\\b`));
      expect(item.prompt.toLowerCase()).not.toContain(item.passage!.toLowerCase());
    }
    for (const item of ITEMS.filter((i) => i.type === "text" && i.expectedText)) {
      // Dictation: Sunny says it, the screen doesn't show it.
      expect(item.say!.toLowerCase()).toContain(item.expectedText!.toLowerCase().replace(/\.$/, ""));
      expect(item.prompt.toLowerCase()).not.toMatch(new RegExp(`\\b${item.expectedText!.toLowerCase().replace(/\.$/, "")}\\b`));
    }
  });

  it("have a picture file for every option picture", () => {
    for (const item of ITEMS) {
      for (const o of item.options ?? []) {
        const picture = optionPicture(o.text).src;
        if (picture) expect(existsSync(path.join(ROOT, "public", picture)), `${item.id}: ${o.text}`).toBe(true);
      }
    }
  });

  it("score into skill areas the SQL adds (reading attitude is recorded, not scored)", () => {
    const setup = read("supabase/setup.sql");
    for (const key of new Set(ITEMS.map((i) => i.skillAreaKey))) {
      if (key === "readingAttitude") continue;
      expect(setup).toContain(`('${key}', `);
    }
  });
});

// 0018 seeded version 1 and 0020 version 2 (shorter stories); 0021 is this one.
describe.each(["supabase/setup.sql", "supabase/migrations/0021_level1_short_parts.sql"])("%s", (file) => {
  it("seeds exactly these items as the Level 1 Form A game", () => {
    expect(gameItemsFrom(read(file))).toEqual(ITEMS);
  });
});

describe("the service worker", () => {
  it("precaches every picture, so picture choices work offline", () => {
    const sw = read("public/sw.js");
    for (const file of readdirSync(path.join(ROOT, "public/pictures")).filter((f) => f.endsWith(".svg"))) {
      expect(sw, file).toContain(`"${file}"`);
    }
  });
});
