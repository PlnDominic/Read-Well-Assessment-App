import { NextResponse, type NextRequest } from "next/server";
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
 * ever reaching a final status (see supabase/migrations/
 * 0013_report_retry_tracking.sql and src/lib/reportRetry.ts for the
 * policy this implements) -- TRD §7's "catch failed report generation
 * before a teacher notices." Once a report's automatic retry budget is
 * used up, this alerts the school's administrators once instead of
 * retrying forever; the existing "Retry PDF" button remains the human
 * recourse after that.
 *
 * Configured as a Vercel Cron Job in vercel.json; see
 * purge-expired-data/route.ts for the CRON_SECRET auth this mirrors.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  if (studentReportsError) return NextResponse.json({ error: studentReportsError.message }, { status: 500 });

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
  if (schoolReportsError) return NextResponse.json({ error: schoolReportsError.message }, { status: 500 });

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

  return NextResponse.json({ ok: true, studentRetried, studentAlerted, schoolRetried, schoolAlerted });
}
