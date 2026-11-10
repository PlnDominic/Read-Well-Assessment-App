import { describe, expect, it } from "vitest";
import { backoffDelayMs, isFinalFailure } from "./syncRetry";

describe("isFinalFailure", () => {
  it("is final for a request the server will never accept", () => {
    for (const status of [400, 403, 404, 409, 422]) expect(isFinalFailure(status)).toBe(true);
  });
  it("is not final when trying again can help", () => {
    for (const status of [408, 429, 500, 502, 503, 200]) expect(isFinalFailure(status)).toBe(false);
  });
});

describe("backoffDelayMs", () => {
  it("doubles from six seconds and stops at a minute", () => {
    expect([0, 1, 2, 3, 4, 10].map(backoffDelayMs)).toEqual([6000, 12000, 24000, 48000, 60000, 60000]);
  });
});
