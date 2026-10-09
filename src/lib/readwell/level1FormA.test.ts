import { describe, expect, it } from "vitest";
import { LEVEL1_FORM_A } from "./level1FormA";
import { bandFor, isScoredItem, itemMaxScore, lineOfWord, shortCode, storyWordCounts } from "./form";

const { items, parts, strands, story } = LEVEL1_FORM_A;

describe("Level 1 Form A item bank", () => {
  it("has the guide's item count in every part", () => {
    const counts: Record<number, number> = {};
    for (const item of items) counts[item.part!] = (counts[item.part!] ?? 0) + 1;
    // Part 11 is 5 questions plus the story reading record.
    expect(counts).toEqual({ 1: 5, 2: 10, 3: 10, 4: 45, 5: 26, 6: 26, 7: 10, 8: 20, 9: 10, 10: 20, 11: 6, 12: 4, 13: 14 });
  });

  it("uses unique codes in the L1A.XX.NN format", () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const item of items) expect(item.id).toMatch(/^L1A\.[A-Z]{2,3}\.(\d{2}|\d\.\d|READ)$/);
    // Row 2 of letter sounds starts "g i h d u c", so LS7 is g.
    expect(items.find((i) => i.id === "L1A.LS.07")?.prompt).toBe("g");
  });

  it("gives each strand the guide's maximum score", () => {
    for (const strand of strands) {
      const max = items
        .filter((i) => strand.parts.includes(i.part!) && isScoredItem(i))
        .reduce((sum, i) => sum + itemMaxScore(i), 0);
      expect(max, strand.key).toBe(strand.max);
    }
  });

  it("puts every scored item in a part that counts toward its strand", () => {
    for (const item of items.filter(isScoredItem)) {
      const part = parts.find((p) => p.number === item.part)!;
      expect(part.strand, item.id).toBe(item.skillAreaKey);
    }
  });

  it("has a 40 word story whose lines match the guide's running totals", () => {
    const counts = storyWordCounts(story.lines);
    expect(counts).toEqual([6, 6, 6, 5, 5, 8, 4]);
    expect(lineOfWord(story.lines, 0)).toBe(1);
    expect(lineOfWord(story.lines, 5)).toBe(1);
    expect(lineOfWord(story.lines, 6)).toBe(2);
    expect(lineOfWord(story.lines, 39)).toBe(7);
    expect(lineOfWord(story.lines, -1)).toBe(0);
  });
});

describe("bands", () => {
  // "Below 30 percent is Emerging, 30 to 69 percent is Developing, 70 to 94
  // percent is Secure, and 95 percent or more is Advanced."
  function byPercentRule(raw: number, max: number) {
    const pct = Math.floor((raw / max) * 100);
    if (pct >= 95) return "Advanced";
    if (pct >= 70) return "Secure";
    if (pct >= 30) return "Developing";
    return "Emerging";
  }

  it("agrees with the guide's one percentage rule for every strand and score", () => {
    for (const strand of strands) {
      if (!strand.cuts) continue;
      for (let raw = 0; raw <= strand.max; raw++) {
        expect(bandFor(raw, strand.cuts), `${strand.key} ${raw}/${strand.max}`).toBe(byPercentRule(raw, strand.max));
      }
    }
  });

  it("matches rows of the guide's band table", () => {
    const letterNames = strands.find((s) => s.key === "letterNames")!.cuts!;
    expect([7, 8, 18, 19, 24, 25].map((r) => bandFor(r, letterNames))).toEqual([
      "Emerging",
      "Developing",
      "Developing",
      "Secure",
      "Secure",
      "Advanced",
    ]);
  });
});

describe("shortCode", () => {
  it("turns item ids into the score sheet's codes", () => {
    expect(shortCode("L1A.LS.07")).toBe("LS7");
    expect(shortCode("L1A.SA.1.1")).toBe("SA1.1");
    expect(shortCode("L1A.STQ.05")).toBe("STQ5");
    expect(shortCode("L1A.ST.READ")).toBe("ST");
  });
});
