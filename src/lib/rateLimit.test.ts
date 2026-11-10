import { afterEach, describe, expect, it, vi } from "vitest";
import { isBlocked, isRateLimited, recordFailure } from "./rateLimit";

// A fresh random key per test/assertion avoids cross-test interference in
// the module-level bucket map isRateLimited shares across the whole file.
// No UPSTASH_REDIS_REST_URL/TOKEN are set in the test environment, so
// these exercise the in-memory fallback exclusively -- deterministic and
// no network calls.
function freshKey() {
  return `test-${Math.random()}`;
}

describe("isRateLimited", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts under the limit", async () => {
    const key = freshKey();
    expect(await isRateLimited(key, 3)).toBe(false);
    expect(await isRateLimited(key, 3)).toBe(false);
    expect(await isRateLimited(key, 3)).toBe(false);
  });

  it("blocks once the limit is reached", async () => {
    const key = freshKey();
    await isRateLimited(key, 2);
    await isRateLimited(key, 2);
    expect(await isRateLimited(key, 2)).toBe(true);
  });

  it("keeps separate counts per key", async () => {
    const keyA = freshKey();
    const keyB = freshKey();
    await isRateLimited(keyA, 1);
    expect(await isRateLimited(keyA, 1)).toBe(true);
    expect(await isRateLimited(keyB, 1)).toBe(false);
  });

  it("resets once the window passes", async () => {
    vi.useFakeTimers();
    const key = freshKey();
    await isRateLimited(key, 1);
    expect(await isRateLimited(key, 1)).toBe(true);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(await isRateLimited(key, 1)).toBe(false);
  });
});

describe("failure-only limiting", () => {
  it("does not count anything until a failure is recorded", async () => {
    const key = freshKey();
    for (let i = 0; i < 50; i++) expect(await isBlocked(key, 3)).toBe(false);
  });

  it("blocks once enough failures are recorded, and only that key", async () => {
    const key = freshKey();
    const other = freshKey();
    await recordFailure(key);
    await recordFailure(key);
    expect(await isBlocked(key, 3)).toBe(false);
    await recordFailure(key);
    expect(await isBlocked(key, 3)).toBe(true);
    expect(await isBlocked(other, 3)).toBe(false);
  });
});
