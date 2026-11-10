import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  alertSchoolReportFailure,
  alertStudentReportFailure,
  generateSchoolReport,
  generateStudentReport,
  markSchoolReportFailed,
  markStudentReportFailed,
} from "@/lib/reports";
import { decideReportRetry } from "@/lib/reportRetry";
import { rescoreAndRegenerate } from "@/lib/sessions";
import { logError } from "@/lib/logger";

/**
 * Retries report generation that failed, or stalled at 'pending' without
 * ever reaching a final status (policy: decideReportRetry in
 * lib/reportRetry.ts), and alerts administrators once a report has used up
 * its automatic retries. TRD §7: "catch failed report generation before a
 * teacher notices."
 *
 * Runs from the daily cycle-scheduler cron rather than a cron of its own:
 * Vercel's Hobby plan rejects any deployment whose vercel.json has a cron
 * that runs more than once a day (see src/lib/vercelConfig.test.ts, which
 * now fails CI on that), and an every-15-minutes schedule here blocked every deploy.
 * /api/cron/retry-failed-reports still exists for running it on demand.
 */
/**
 * Finds recently completed sessions that have no result rows (scoring failed
 * after the session was marked completed, which older versions of
 * completeSession allowed) and scores them again, then re-renders their
 * reports. At most 20 a run, so one bad batch can't use up the whole request.
 */
export async function rescoreUnscoredSessions(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: completed } = await admin
    .from("assessment_sessions")
    .select("id")
    .eq("status", "completed")
    .gte("completed_at", since)
    .limit(1000);
  const ids = (completed ?? []).map((row) => row.id);
  if (ids.length === 0) return 0;

  const { data: scored } = await admin.from("results").select("session_id").in("session_id", ids);
  const scoredIds = new Set((scored ?? []).map((row) => row.session_id));
  const missing = ids.filter((id) => !scoredIds.has(id)).slice(0, 20);

  let fixed = 0;
  for (const id of missing) {
    try {
      await rescoreAndRegenerate(admin, id);
      fixed++;
    } catch (err) {
      await logError("cron:rescore-unscored", err, { session: id });
    }
  }
  return fixed;
}

export async function retryFailedReports() {
  const admin = createAdminClient();
  const now = new Date();
  let studentRetried = 0;
  let studentAlerted = 0;
  let schoolRetried = 0;
  let schoolAlerted = 0;

  const { data: studentReports, error: studentReportsError } = await admin
    .from("student_reports")
    .select("id, session_id, student_id, status, retry_count, attempted_at, alerted_at, last_error")
    .in("status", ["failed", "pending"]);
  if (studentReportsError) throw studentReportsError;

  for (const report of studentReports ?? []) {
    const decision = decideReportRetry(
      { status: report.status, retryCount: report.retry_count, attemptedAt: report.attempted_at, alertedAt: report.alerted_at },
      now
    );
    if (decision === "retry") {
      await admin.from("student_reports").update({ retry_count: report.retry_count + 1 }).eq("id", report.id);
      try {
        await generateStudentReport(report.session_id, { notify: false });
      } catch (err) {
        await markStudentReportFailed(admin, report.session_id, err);
      }
      studentRetried++;
    } else if (decision === "alert") {
      await alertStudentReportFailure(admin, report);
      studentAlerted++;
    }
  }

  const { data: schoolReports, error: schoolReportsError } = await admin
    .from("school_reports")
    .select("id, school_id, cycle_id, status, retry_count, attempted_at, alerted_at, last_error")
    .in("status", ["failed", "pending"]);
  if (schoolReportsError) throw schoolReportsError;

  for (const report of schoolReports ?? []) {
    const decision = decideReportRetry(
      { status: report.status, retryCount: report.retry_count, attemptedAt: report.attempted_at, alertedAt: report.alerted_at },
      now
    );
    if (decision === "retry") {
      await admin.from("school_reports").update({ retry_count: report.retry_count + 1 }).eq("id", report.id);
      try {
        await generateSchoolReport(report.school_id, report.cycle_id);
      } catch (err) {
        await markSchoolReportFailed(admin, report.school_id, report.cycle_id, err);
      }
      schoolRetried++;
    } else if (decision === "alert") {
      await alertSchoolReportFailure(admin, report);
      schoolAlerted++;
    }
  }

  const rescored = await rescoreUnscoredSessions(admin);

  return { studentRetried, studentAlerted, schoolRetried, schoolAlerted, rescored };
}
