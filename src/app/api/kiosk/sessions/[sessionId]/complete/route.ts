import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreSession } from "@/lib/scoring";
import { generateSchoolReport, generateStudentReport, markSchoolReportFailed, markStudentReportFailed } from "@/lib/reports";

/**
 * POST /api/kiosk/sessions/:id/complete: Assessment Service "complete"
 * endpoint (TRD §4.1). Marks the session done, runs the Scoring Service
 * synchronously (fast: a handful of rows), then schedules PDF report
 * generation with `after()` so it never blocks this response (TRD §5).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const admin = createAdminClient();

  const { data: session, error: sessionError } = await admin
    .from("assessment_sessions")
    .select("id, status, student_id, cycle_id")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status === "completed") return NextResponse.json({ ok: true });

  const { error: updateError } = await admin
    .from("assessment_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await scoreSession(admin, sessionId);

  await admin.from("student_reports").upsert(
    { student_id: session.student_id, session_id: sessionId, overall_label: "Pending", status: "pending" },
    { onConflict: "session_id" }
  );

  const { data: student } = await admin
    .from("students")
    .select("school_id")
    .eq("id", session.student_id)
    .single();

  // A placeholder row so a failure has somewhere to record status/last_error
  // against (the student_reports row above serves the same purpose for the
  // per-student PDF) -- without this, a school report that fails on its
  // very first attempt for a cycle would leave no row at all, and the
  // admin dashboard would show "PDF pending" forever with no way to retry.
  if (student?.school_id) {
    await admin
      .from("school_reports")
      .upsert({ school_id: student.school_id, cycle_id: session.cycle_id, status: "pending" }, { onConflict: "school_id,cycle_id" });
  }

  after(async () => {
    try {
      await generateStudentReport(sessionId);
    } catch (err) {
      console.error(`generateStudentReport failed for session ${sessionId}`, err);
      await markStudentReportFailed(admin, sessionId, err);
    }

    if (student?.school_id) {
      try {
        await generateSchoolReport(student.school_id, session.cycle_id);
      } catch (err) {
        console.error(`generateSchoolReport failed for school ${student.school_id}`, err);
        await markSchoolReportFailed(admin, student.school_id, session.cycle_id, err);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
