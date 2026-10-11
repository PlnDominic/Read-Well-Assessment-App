import { describe, expect, it } from "vitest";
import type { AssessmentItem } from "@/lib/database.types";
import { groupByPart, nextItemId, orderByPart, validateGameItems } from "@/lib/gameItems";
import { LEVEL_PARTS, partsFor } from "@/lib/gameParts";
import { LEVEL1_FORM_A_GAME_ITEMS } from "@/lib/readwell/level1FormAGame";

const choice = (id: string, options = [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }]): AssessmentItem => ({
  id,
  skillAreaKey: "letterSounds",
  type: "choice",
  prompt: "Which one?",
  options,
});

describe("nextItemId", () => {
  it("numbers on from the highest id in the part", () => {
    expect(nextItemId([{ id: "VO01" }, { id: "VO06" }, { id: "LC09" }], "VO")).toBe("VO07");
  });

  it("starts a part at 01, and ignores ids that only start the same way", () => {
    expect(nextItemId([{ id: "VOX3" }, { id: "item-abc" }], "VO")).toBe("VO01");
  });
});

describe("groupByPart", () => {
  const parts = LEVEL_PARTS[1];

  it("lists every part in order, empty ones included, and questions with no part last", () => {
    const groups = groupByPart([{ id: "VO01" }, { id: "LC01" }, { id: "item-x" }, { id: "VO02" }], parts);
    expect(groups.map((g) => g.part?.code ?? null)).toEqual([...parts.map((p) => p.code), null]);
    expect(groups.find((g) => g.part?.code === "VO")!.indexes).toEqual([0, 3]);
    expect(groups.find((g) => g.part?.code === "LC")!.indexes).toEqual([1]);
    expect(groups.at(-1)!.indexes).toEqual([2]);
  });

  it("has no 'no part' group when every question has one", () => {
    expect(groupByPart([{ id: "LC01" }], parts)).toHaveLength(parts.length);
  });
});

describe("orderByPart", () => {
  it("puts a part's questions together, in part order, keeping their order within the part", () => {
    const items = [{ id: "VO01" }, { id: "LC01" }, { id: "item-x" }, { id: "VO02" }, { id: "LC02" }];
    expect(orderByPart(items, LEVEL_PARTS[1]).map((i) => i.id)).toEqual(["LC01", "LC02", "VO01", "VO02", "item-x"]);
  });

  it("leaves the Level 1 Form A game as it is: already in mission order", () => {
    expect(orderByPart(LEVEL1_FORM_A_GAME_ITEMS, partsFor(1))).toEqual(LEVEL1_FORM_A_GAME_ITEMS);
  });
});

describe("validateGameItems", () => {
  it("passes the Level 1 Form A game", () => {
    expect(validateGameItems(LEVEL1_FORM_A_GAME_ITEMS)).toEqual([]);
  });

  it("needs at least one question", () => {
    expect(validateGameItems([])).toEqual([{ index: -1, message: "Add at least one question." }]);
  });

  it("points at the question with the problem", () => {
    const items = [
      choice("LS01"),
      { ...choice("LS02"), prompt: " " },
      choice("LS03", [{ text: "a", isCorrect: false }, { text: "b", isCorrect: false }]),
      choice("LS04", [{ text: "a", isCorrect: true }, { text: "", isCorrect: false }]),
      choice("LS05", [{ text: "a", isCorrect: true }]),
      choice("ls01"),
    ];
    expect(validateGameItems(items)).toEqual([
      { index: 1, message: "Write the question the child sees." },
      { index: 2, message: "Mark which answer is right." },
      { index: 3, message: "One of the answers is empty." },
      { index: 4, message: "Give at least two answers to tap." },
      { index: 5, message: "Another question already uses the id ls01." },
    ]);
  });

  it("lets every answer be right, for questions with no wrong answer", () => {
    const feelings = choice("AT01", [{ text: "😀 Happy", isCorrect: true }, { text: "😢 Sad", isCorrect: true }]);
    expect(validateGameItems([feelings])).toEqual([]);
  });

  it("needs no answers on read-aloud and writing questions", () => {
    const mic: AssessmentItem = { id: "RW01", skillAreaKey: "wordReading", type: "mic", prompt: "Read it.", passage: "sat" };
    const text: AssessmentItem = { id: "WT01", skillAreaKey: "writing", type: "text", prompt: "Write your name." };
    expect(validateGameItems([mic, text])).toEqual([]);
  });
});
