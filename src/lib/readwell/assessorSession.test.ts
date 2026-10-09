import { describe, expect, it } from "vitest";
import { invalidAnswerReason, isCorrectFor } from "./assessorSession";
import { LEVEL1_FORM_A as form } from "./level1FormA";

const item = (id: string) => form.items.find((i) => i.id === id)!;

describe("invalidAnswerReason", () => {
  it("accepts 0 or 1 for an ordinary item, and null to clear it", () => {
    expect(invalidAnswerReason(form, item("L1A.LS.01"), 1)).toBeNull();
    expect(invalidAnswerReason(form, item("L1A.LS.01"), 0)).toBeNull();
    expect(invalidAnswerReason(form, item("L1A.LS.01"), null)).toBeNull();
  });

  it.each([2, -1, 0.5, "1", true, {}])("rejects %j for an ordinary item", (value) => {
    expect(invalidAnswerReason(form, item("L1A.LS.01"), value)).not.toBeNull();
  });

  it("accepts 0-2 for the name task", () => {
    expect(invalidAnswerReason(form, item("L1A.WT.01"), 2)).toBeNull();
    expect(invalidAnswerReason(form, item("L1A.WT.01"), 3)).not.toBeNull();
  });

  it("accepts only the listed reading attitude answers", () => {
    expect(invalidAnswerReason(form, item("L1A.AT.01"), 3)).toBeNull();
    expect(invalidAnswerReason(form, item("L1A.AT.01"), 4)).not.toBeNull();
    expect(invalidAnswerReason(form, item("L1A.AT.04"), "sometimes")).toBeNull();
    expect(invalidAnswerReason(form, item("L1A.AT.04"), "maybe")).not.toBeNull();
  });

  it("accepts a well-formed story reading record", () => {
    expect(invalidAnswerReason(form, item("L1A.ST.READ"), { errorWords: [0, 12], lastWord: 39, seconds: 95 })).toBeNull();
    expect(invalidAnswerReason(form, item("L1A.ST.READ"), { errorWords: [], lastWord: -1, seconds: 0 })).toBeNull();
  });

  it.each([
    ["a word past the end", { errorWords: [40], lastWord: 39, seconds: 60 }],
    ["a repeated error", { errorWords: [3, 3], lastWord: 39, seconds: 60 }],
    ["over 2 minutes", { errorWords: [], lastWord: 39, seconds: 121 }],
    ["an extra field", { errorWords: [], lastWord: 39, seconds: 60, note: "x" }],
    ["a missing field", { errorWords: [], seconds: 60 }],
    ["not an object", "40 words"],
  ])("rejects a story record with %s", (_label, value) => {
    expect(invalidAnswerReason(form, item("L1A.ST.READ"), value)).not.toBeNull();
  });
});

describe("isCorrectFor", () => {
  it("is full marks on scored items and null on unscored ones", () => {
    expect(isCorrectFor(item("L1A.LS.01"), 1)).toBe(true);
    expect(isCorrectFor(item("L1A.LS.01"), 0)).toBe(false);
    expect(isCorrectFor(item("L1A.WT.01"), 1)).toBe(false);
    expect(isCorrectFor(item("L1A.WT.01"), 2)).toBe(true);
    expect(isCorrectFor(item("L1A.AT.01"), 3)).toBeNull();
  });
});
