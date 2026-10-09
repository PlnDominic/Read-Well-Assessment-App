import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEVEL1_FORM_A_ITEMS, LEVEL1_SKILL_AREAS } from "./level1FormA";

/**
 * The KG 1 items live in the database (assessments.items), seeded from two
 * SQL files people paste or run. They must match the item bank exactly:
 * "item codes never change" and "paper is the master" only hold if the
 * stored copy is the code's copy.
 *
 * After changing level1FormA.ts, regenerate the JSON in both files: each
 * item is JSON.stringify(item) on its own line, with ' doubled for SQL.
 */
const SQL_FILES = ["supabase/setup.sql", "supabase/migrations/0016_readwell_level1_kg1.sql"];

function kg1ItemsFrom(sql: string): unknown {
  const match = /select -1, 1, '(\[[\s\S]*?\])'::jsonb/.exec(sql);
  if (!match) throw new Error("No KG 1 assessment insert found");
  return JSON.parse(match[1].replace(/''/g, "'"));
}

describe.each(SQL_FILES)("%s", (file) => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../../..", file), "utf8");

  it("seeds exactly the item bank's KG 1 items", () => {
    expect(kg1ItemsFrom(sql)).toEqual(LEVEL1_FORM_A_ITEMS);
  });

  it("adds every strand skill area the items use", () => {
    for (const { key } of LEVEL1_SKILL_AREAS) {
      // Vocabulary comes from the Grade 1 starter content instead.
      if (key === "vocabulary") continue;
      expect(sql).toContain(`('${key}', `);
    }
  });
});
