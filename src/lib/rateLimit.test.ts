import { afterEach, describe, expect, it, vi } from "vitest";
import { isRateLimited } from "./rateLimit";

// A fresh random key per test/assertion avoids cross-test interference in
// the module-level bucket map isRateLimited shares across the whole file.
function freshKey() {
  return `test-${Math.random()}`;
}

describe("isRateLimited", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts under the limit", () => {
    const key = freshKey();
    expect(isRateLimited(key, 3)).toBe(false);
    expect(isRateLimited(key, 3)).toBe(false);
    expect(isRateLimited(key, 3)).toBe(false);
  });

  it("blocks once the limit is reached", () => {
    const key = freshKey();
    isRateLimited(key, 2);
    isRateLimited(key, 2);
    expect(isRateLimited(key, 2)).toBe(true);
  });

  it("keeps separate counts per key", () => {
    const keyA = freshKey();
    const keyB = freshKey();
    isRateLimited(keyA, 1);
    expect(isRateLimited(keyA, 1)).toBe(true);
    expect(isRateLimited(keyB, 1)).toBe(false);
  });

  it("resets once the window passes", () => {
    vi.useFakeTimers();
    const key = freshKey();
    isRateLimited(key, 1);
    expect(isRateLimited(key, 1)).toBe(true);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(isRateLimited(key, 1)).toBe(false);
  });
});
