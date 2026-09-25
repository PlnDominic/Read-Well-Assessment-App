import { describe, expect, it } from "vitest";
import { aggregateSkillScores, computeOverallLabel, computeWeightedAverage } from "./scoring";
import type { AssessmentItem } from "./database.types";

describe("computeOverallLabel", () => {
  it("reads as On Track with zero flagged areas", () => {
    expect(computeOverallLabel(0)).toBe("On Track");
  });

  it("reads as On Track with exactly one flagged area (matches Amara's mock report)", () => {
    expect(computeOverallLabel(1)).toBe("On Track");
  });

  it("reads as Needs Support with two or more flagged areas (matches Diego's mock report)", () => {
    expect(computeOverallLabel(2)).toBe("Needs Support");
    expect(computeOverallLabel(4)).toBe("Needs Support");
  });
});

describe("aggregateSkillScores", () => {
  const items: AssessmentItem[] = [
    { id: "q1", skillAreaKey: "phonics", type: "choice", prompt: "p1", options: [] },
    { id: "q2", skillAreaKey: "fluency", type: "mic", prompt: "p2" },
    { id: "q3", skillAreaKey: "fluency", type: "mic", prompt: "p3" },
  ];
  const skillAreaIdByKey = new Map([
    ["phonics", "sa-phonics"],
    ["fluency", "sa-fluency"],
  ]);

  it("scores 100% for a single-item skill area answered correctly", () => {
    const correctByItemId = new Map([["q1", true]]);
    const [phonics] = aggregateSkillScores(
      items.filter((i) => i.skillAreaKey === "phonics"),
      correctByItemId,
      skillAreaIdByKey
    );
    expect(phonics).toMatchObject({ skillAreaKey: "phonics", score: 100, flagged: false });
  });

  it("scores 0% and flags a single-item skill area answered incorrectly", () => {
    const correctByItemId = new Map([["q1", false]]);
    const [phonics] = aggregateSkillScores(
      items.filter((i) => i.skillAreaKey === "phonics"),
      correctByItemId,
      skillAreaIdByKey
    );
    expect(phonics).toMatchObject({ score: 0, flagged: true });
  });

  it("averages across multiple items sharing a skill area", () => {
    const correctByItemId = new Map([
      ["q2", true],
      ["q3", false],
    ]);
    const results = aggregateSkillScores(items, correctByItemId, skillAreaIdByKey);
    const fluency = results.find((r) => r.skillAreaKey === "fluency");
    expect(fluency).toMatchObject({ score: 50, flagged: true });
  });

  it("treats an unanswered item as incorrect", () => {
    const results = aggregateSkillScores(
      items.filter((i) => i.skillAreaKey === "phonics"),
      new Map(),
      skillAreaIdByKey
    );
    expect(results[0]).toMatchObject({ score: 0, flagged: true });
  });

  it("skips items whose skill area has no matching reference row", () => {
    const orphanItem: AssessmentItem = { id: "q4", skillAreaKey: "unknown", type: "choice", prompt: "p4", options: [] };
    const results = aggregateSkillScores([orphanItem], new Map([["q4", true]]), skillAreaIdByKey);
    expect(results).toHaveLength(0);
  });

  it("flags exactly at the FLAGGED_SCORE_THRESHOLD boundary (65%)", () => {
    const threeItems: AssessmentItem[] = [
      { id: "a", skillAreaKey: "phonics", type: "choice", prompt: "", options: [] },
      { id: "b", skillAreaKey: "phonics", type: "choice", prompt: "", options: [] },
      { id: "c", skillAreaKey: "phonics", type: "choice", prompt: "", options: [] },
    ];
    // 2/3 correct = 67% -> not flagged (>= 65)
    const notFlagged = aggregateSkillScores(
      threeItems,
      new Map([
        ["a", true],
        ["b", true],
        ["c", false],
      ]),
      skillAreaIdByKey
    );
    expect(notFlagged[0]).toMatchObject({ score: 67, flagged: false });
  });

  it("uses a per-skill-area threshold override instead of the 65% default", () => {
    // 70% would pass the global default but fail a school-configured 75%.
    const tenItems: AssessmentItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      skillAreaKey: "phonics",
      type: "choice",
      prompt: "",
      options: [],
    }));
    const correctByItemId = new Map(tenItems.slice(0, 7).map((i) => [i.id, true]));
    const thresholdBySkillAreaId = new Map([["sa-phonics", 75]]);

    const [defaultThreshold] = aggregateSkillScores(tenItems, correctByItemId, skillAreaIdByKey);
    expect(defaultThreshold).toMatchObject({ score: 70, flagged: false });

    const [overridden] = aggregateSkillScores(tenItems, correctByItemId, skillAreaIdByKey, thresholdBySkillAreaId);
    expect(overridden).toMatchObject({ score: 70, flagged: true });
  });
});

describe("computeWeightedAverage", () => {
  it("returns 0 for an empty list", () => {
    expect(computeWeightedAverage([])).toBe(0);
  });

  it("defaults to an unweighted mean when no weights are given", () => {
    const scores = [
      { score: 80, skillAreaId: "a" },
      { score: 40, skillAreaId: "b" },
    ];
    expect(computeWeightedAverage(scores)).toBe(60);
  });

  it("weights a skill area's contribution per the configured weight", () => {
    const scores = [
      { score: 100, skillAreaId: "a" },
      { score: 0, skillAreaId: "b" },
    ];
    // Weighting "a" 3x pulls the average toward its score.
    const weights = new Map([["a", 3]]);
    expect(computeWeightedAverage(scores, weights)).toBe(75);
  });
});
