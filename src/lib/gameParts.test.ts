import { describe, expect, it } from "vitest";
import { LEVEL_PARTS } from "@/lib/gameParts";

describe.each(Object.entries(LEVEL_PARTS))("Level %s's parts", (_level, parts) => {
  it("play as seven missions, each one or two neighbouring parts of one sitting", () => {
    const keys = parts.map((p) => p.mission.key);
    expect(new Set(keys).size).toBe(7);
    for (const key of new Set(keys)) {
      const at = parts.map((p, i) => (p.mission.key === key ? i : -1)).filter((i) => i >= 0);
      expect(at.length, key).toBeLessThanOrEqual(2);
      // Neighbours, in the same sitting.
      expect(at[at.length - 1] - at[0], key).toBe(at.length - 1);
      expect(new Set(at.map((i) => parts[i].sitting)).size, key).toBe(1);
    }
  });

  it("give a mission the same name wherever its parts say it", () => {
    for (const a of parts) for (const b of parts) if (a.mission.key === b.mission.key) expect(a.mission).toEqual(b.mission);
  });
});
