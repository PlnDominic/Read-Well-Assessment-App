import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Vercel's Hobby plan rejects the whole deployment (not just the cron) when
// vercel.json has a cron that runs more than once a day. GitHub CI doesn't
// read vercel.json, so a too-frequent schedule once passed CI while every
// production deploy failed and the live site stayed on stale, broken code.
// This makes CI fail first.
describe("vercel.json crons", () => {
  const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../vercel.json"), "utf8")) as {
    crons?: { path: string; schedule: string }[];
  };

  it.each(config.crons ?? [])("$path runs at most once a day ($schedule)", ({ schedule }) => {
    const [minute, hour] = schedule.trim().split(/\s+/);
    expect(minute, "minute must be one fixed value").toMatch(/^\d+$/);
    expect(hour, "hour must be one fixed value").toMatch(/^\d+$/);
  });
});
