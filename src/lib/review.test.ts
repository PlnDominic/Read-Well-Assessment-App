import { describe, expect, it } from "vitest";
import { applyReview, isScoreChangedByReview, parseReviewVerdict } from "./review";

const now = new Date("2026-09-27T12:00:00.000Z");
const unreviewedWrong = { is_correct: false, auto_is_correct: null, reviewed_at: null };

describe("parseReviewVerdict", () => {
  it("accepts the three verdicts", () => {
    expect(parseReviewVerdict("correct")).toBe("correct");
    expect(parseReviewVerdict("incorrect")).toBe("incorrect");
    expect(parseReviewVerdict("reset")).toBe("reset");
  });

  it("rejects anything else", () => {
    expect(parseReviewVerdict("true")).toBeNull();
    expect(parseReviewVerdict(null)).toBeNull();
    expect(parseReviewVerdict("")).toBeNull();
  });
});

describe("applyReview", () => {
  it("captures the automatic score on the first review", () => {
    expect(applyReview(unreviewedWrong, "correct", "t1", now)).toEqual({
      is_correct: true,
      auto_is_correct: false,
      reviewed_by: "t1",
      reviewed_at: now.toISOString(),
    });
  });

  it("keeps the original automatic score across repeated reviews", () => {
    const first = applyReview(unreviewedWrong, "correct", "t1", now);
    const second = applyReview(first, "incorrect", "t2", now);
    expect(second.is_correct).toBe(false);
    expect(second.auto_is_correct).toBe(false);
    expect(second.reviewed_by).toBe("t2");
  });

  it("records a review that confirms the automatic score", () => {
    const update = applyReview(unreviewedWrong, "incorrect", "t1", now);
    expect(update.is_correct).toBe(false);
    expect(update.auto_is_correct).toBe(false);
    expect(update.reviewed_at).not.toBeNull();
  });

  it("reset restores the automatic score and clears the review", () => {
    const reviewed = applyReview(unreviewedWrong, "correct", "t1", now);
    expect(applyReview(reviewed, "reset", "t1", now)).toEqual({
      is_correct: false,
      auto_is_correct: null,
      reviewed_by: null,
      reviewed_at: null,
    });
  });

  it("reset on an unreviewed response leaves the score untouched", () => {
    expect(applyReview({ is_correct: true, auto_is_correct: null, reviewed_at: null }, "reset", "t1", now).is_correct).toBe(
      true
    );
  });
});

describe("isScoreChangedByReview", () => {
  it("is false for an unreviewed response", () => {
    expect(isScoreChangedByReview(unreviewedWrong)).toBe(false);
  });

  it("is true when the review flipped the score", () => {
    expect(isScoreChangedByReview(applyReview(unreviewedWrong, "correct", "t1", now))).toBe(true);
  });

  it("is false when the review confirmed the score", () => {
    expect(isScoreChangedByReview(applyReview(unreviewedWrong, "incorrect", "t1", now))).toBe(false);
  });
});
