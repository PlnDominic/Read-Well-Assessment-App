import { describe, expect, it } from "vitest";
import { skillKeyFromName } from "@/lib/skillAreas";

describe("skillKeyFromName", () => {
  it("makes a camelCase key from the name", () => {
    expect(skillKeyFromName("Oral language")).toBe("oralLanguage");
    expect(skillKeyFromName("  Grammar & USAGE ")).toBe("grammarUsage");
    expect(skillKeyFromName("Écriture")).toBe("ecriture");
  });

  it("always starts with a letter", () => {
    expect(skillKeyFromName("2 letter blends")).toBe("skill2LetterBlends");
  });

  it("needs a letter to make a key from", () => {
    expect(skillKeyFromName("")).toBeNull();
    expect(skillKeyFromName("123 !!")).toBeNull();
  });
});
