import { describe, expect, it } from "vitest";
import { evaluateResponse, generateSessionCode, normalizeSessionCode } from "./kiosk";
import type { AssessmentItem } from "./database.types";

describe("evaluateResponse", () => {
  const choiceItem: AssessmentItem = {
    id: "q1",
    skillAreaKey: "phonics",
    type: "choice",
    prompt: "Tap the word that starts with /b/",
    options: [
      { text: "BALL", isCorrect: true },
      { text: "CAT", isCorrect: false },
    ],
  };

  const micItem: AssessmentItem = {
    id: "q2",
    skillAreaKey: "fluency",
    type: "mic",
    prompt: 'Read this word aloud: "jump"',
  };

  it("marks the correct option as correct", () => {
    expect(evaluateResponse(choiceItem, "BALL")).toBe(true);
  });

  it("marks any other option as incorrect", () => {
    expect(evaluateResponse(choiceItem, "CAT")).toBe(false);
  });

  it("marks an answer matching no option as incorrect", () => {
    expect(evaluateResponse(choiceItem, "DOG")).toBe(false);
  });

  it("marks a completed mic attempt as correct (no real speech scoring — see README)", () => {
    expect(evaluateResponse(micItem, "attempted")).toBe(true);
  });

  it("marks anything other than 'attempted' as incorrect for a mic item", () => {
    expect(evaluateResponse(micItem, "idle")).toBe(false);
  });
});

describe("normalizeSessionCode", () => {
  it("trims whitespace and uppercases", () => {
    expect(normalizeSessionCode("  abc123 ")).toBe("ABC123");
  });
});

describe("generateSessionCode", () => {
  it("generates a 6-character code from the expected alphabet", () => {
    const code = generateSessionCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("does not include easily-confused characters (0/O/1/I)", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSessionCode()).not.toMatch(/[01OI]/);
    }
  });
});
