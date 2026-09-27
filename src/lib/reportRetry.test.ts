import { describe, expect, it } from "vitest";
import { decideReportRetry, type RetryableReport } from "./reportRetry";

const now = new Date("2026-09-27T12:00:00.000Z");
const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString();

function report(overrides: Partial<RetryableReport>): RetryableReport {
  return { status: "failed", retryCount: 0, attemptedAt: null, alertedAt: null, ...overrides };
}

describe("decideReportRetry", () => {
  it("skips a ready report", () => {
    expect(decideReportRetry(report({ status: "ready" }), now)).toBe("skip");
  });

  it("skips a pending report that's still fresh", () => {
    expect(decideReportRetry(report({ status: "pending", attemptedAt: fiveMinAgo }), now)).toBe("skip");
  });

  it("skips a pending report with no attemptedAt yet within the same tick (never actually stuck logic aside, null means unknown/never attempted -> treat as stuck)", () => {
    // attemptedAt is only ever null before the very first attempt starts;
    // treating that as "stuck" means a report stuck at 'pending' with no
    // recorded attempt at all still gets picked up rather than ignored forever.
    expect(decideReportRetry(report({ status: "pending", attemptedAt: null }), now)).toBe("retry");
  });

  it("retries a pending report that's been stuck past the threshold", () => {
    expect(decideReportRetry(report({ status: "pending", attemptedAt: twentyMinAgo }), now)).toBe("retry");
  });

  it("retries a failed report under the retry budget", () => {
    expect(decideReportRetry(report({ status: "failed", retryCount: 1 }), now)).toBe("retry");
  });

  it("retries right up to the last attempt before the budget is exhausted", () => {
    expect(decideReportRetry(report({ status: "failed", retryCount: 2 }), now, { maxRetries: 3 })).toBe("retry");
  });

  it("alerts once the retry budget is exhausted and no alert has gone out yet", () => {
    expect(decideReportRetry(report({ status: "failed", retryCount: 3 }), now, { maxRetries: 3 })).toBe("alert");
  });

  it("skips (doesn't re-alert) once already alerted", () => {
    expect(
      decideReportRetry(report({ status: "failed", retryCount: 3, alertedAt: fiveMinAgo }), now, { maxRetries: 3 })
    ).toBe("skip");
  });

  it("honors a custom stuckAfterMinutes", () => {
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    expect(decideReportRetry(report({ status: "pending", attemptedAt: tenMinAgo }), now, { stuckAfterMinutes: 5 })).toBe(
      "retry"
    );
    expect(decideReportRetry(report({ status: "pending", attemptedAt: tenMinAgo }), now, { stuckAfterMinutes: 15 })).toBe(
      "skip"
    );
  });
});
