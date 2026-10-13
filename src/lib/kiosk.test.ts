import { describe, expect, it } from "vitest";
import {
  evaluateResponse,
  generateSessionCode,
  normalizeSessionCode,
  normalizeSpokenText,
} from "./kiosk";
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

  const micItemWithExpectedText: AssessmentItem = {
    ...micItem,
    expectedText: "jump",
  };

  const writingItem: AssessmentItem = {
    id: "wt1",
    skillAreaKey: "phonics",
    type: "text",
    prompt: "Write the word flat.",
    expectedText: "flat",
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

  it("marks a completed mic attempt as correct when no expectedText is configured (legacy fallback)", () => {
    expect(evaluateResponse(micItem, "attempted")).toBe(true);
    expect(evaluateResponse(micItem, "anything at all")).toBe(true);
  });

  it("marks a skipped mic item as incorrect, with or without expectedText", () => {
    expect(evaluateResponse(micItem, "skipped")).toBe(false);
    expect(evaluateResponse(micItemWithExpectedText, "skipped")).toBe(false);
  });

  it("marks an empty mic answer as incorrect even with no expectedText", () => {
    expect(evaluateResponse(micItem, "")).toBe(false);
  });

  it("treats the 'attempted' sentinel as correct even when expectedText is set (unsupported-browser fallback)", () => {
    expect(evaluateResponse(micItemWithExpectedText, "attempted")).toBe(true);
  });

  it("marks a transcript containing the expected word as correct", () => {
    expect(evaluateResponse(micItemWithExpectedText, "Jump.")).toBe(true);
    expect(evaluateResponse(micItemWithExpectedText, "jump")).toBe(true);
  });

  it("marks a transcript not containing the expected word as incorrect", () => {
    expect(evaluateResponse(micItemWithExpectedText, "run")).toBe(false);
  });

  it("counts the recognizer's other guesses, so a close mishearing isn't a miss", () => {
    expect(evaluateResponse(micItemWithExpectedText, "jum | jump | dump")).toBe(true);
    expect(evaluateResponse(micItemWithExpectedText, "dump | lump")).toBe(false);
  });

  it("matches a short word as a whole word, a longer one inside what was said", () => {
    const of = { ...micItemWithExpectedText, expectedText: "of" };
    expect(evaluateResponse(of, "off")).toBe(false);
    expect(evaluateResponse(of, "of")).toBe(true);
    expect(evaluateResponse(micItemWithExpectedText, "jumps")).toBe(true);
  });

  it("reads digits as the number words they stand for", () => {
    const ten = { ...micItemWithExpectedText, expectedText: "ten" };
    expect(evaluateResponse(ten, "10")).toBe(true);
  });

  it("scores silence as a miss, like a skip", () => {
    expect(evaluateResponse(micItemWithExpectedText, "nospeech")).toBe(false);
    expect(evaluateResponse(micItem, "nospeech")).toBe(false);
  });

  it("scores a Level 2 writing response against its expected text", () => {
    expect(evaluateResponse(writingItem, "flat")).toBe(true);
    expect(evaluateResponse(writingItem, "")).toBe(false);
    expect(evaluateResponse(writingItem, "frog")).toBe(false);
  });
});

describe("normalizeSpokenText", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeSpokenText("Jump.")).toBe("jump");
    expect(normalizeSpokenText("  The   Cat!  ")).toBe("the cat");
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
