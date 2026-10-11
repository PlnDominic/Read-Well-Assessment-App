import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEVEL1_FORM_A_GAME_ITEMS as ITEMS } from "./level1FormAGame";
import { optionPicture } from "@/lib/optionPicture";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

// The guide's thirteen parts, in its order.
const PART_ORDER = ["LC", "VO", "CP", "SA", "LN", "LS", "CV", "RW", "NW", "HW", "ST", "AT", "WT"];

function gameItemsFrom(sql: string): unknown {
  const match = /select 1, 'A', 'game', 1, '(\[[\s\S]*?\])'::jsonb/.exec(sql);
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

describe.each(["supabase/setup.sql", "supabase/migrations/0018_assessment_delivery.sql"])("%s", (file) => {
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
