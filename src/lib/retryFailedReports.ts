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

  return { studentRetried, studentAlerted, schoolRetried, schoolAlerted };
}
