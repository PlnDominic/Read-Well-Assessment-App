/**
 * Automatic retry + admin alerting for report generation (see
 * supabase/migrations/0013_report_retry_tracking.sql and
 * src/app/api/cron/retry-failed-reports/route.ts). Pure so the retry
 * policy is testable without a Supabase client.
 */

export const MAX_AUTOMATIC_RETRIES = 3;
export const STUCK_PENDING_MINUTES = 15;

export interface RetryableReport {
  status: "pending" | "ready" | "failed";
  retryCount: number;
  attemptedAt: string | null;
  alertedAt: string | null;
}

export type RetryDecision = "retry" | "alert" | "skip";

/**
 * What the retry cron should do with one report row.
 *
 * A 'pending' report is only actionable once it's been sitting untouched
 * longer than STUCK_PENDING_MINUTES -- otherwise it's most likely just a
 * generation that's genuinely still running, and touching it would race
 * the in-flight attempt. Once it counts as stuck, it's treated exactly
 * like a 'failed' report from here down.
 *
 * Once the automatic retry budget (MAX_AUTOMATIC_RETRIES) is used up,
 * 'alert' fires once (alertedAt null) and every run after that is 'skip'
 * until either alertedAt is cleared (a later successful generation resets
 * it) or the human "Retry PDF" button succeeds.
 */
export function decideReportRetry(
  report: RetryableReport,
  now: Date,
  { maxRetries = MAX_AUTOMATIC_RETRIES, stuckAfterMinutes = STUCK_PENDING_MINUTES }: { maxRetries?: number; stuckAfterMinutes?: number } = {}
): RetryDecision {
  if (report.status === "ready") return "skip";

  if (report.status === "pending") {
    const attemptedAt = report.attemptedAt ? new Date(report.attemptedAt) : null;
    const stuckMs = stuckAfterMinutes * 60 * 1000;
    const isStuck = !attemptedAt || now.getTime() - attemptedAt.getTime() > stuckMs;
    if (!isStuck) return "skip";
  }

  if (report.retryCount >= maxRetries) {
    return report.alertedAt ? "skip" : "alert";
  }
  return "retry";
}
