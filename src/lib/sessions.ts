import "server-only";
import { after } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { scoreSession } from "@/lib/scoring";
import { generateSchoolReport, generateStudentReport, markSchoolReportFailed, markStudentReportFailed } from "@/lib/reports";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Marks a session done, runs the Scoring Service synchronously (fast: a
 * few hundred rows at most), then schedules PDF report generation with
 * `after()` so it never blocks the response (TRD §5). Shared by the
 * student kiosk and the assessor screen; each route does its own
 * authorization first. A session that's already completed is left alone.
 */
export async function completeSession(admin: AdminClient, sessionId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: session, error: sessionError } = await admin
    .from("assessment_sessions")
    .select("id, status, student_id, cycle_id")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) return { ok: false, status: 404, error: "Session not found" };
  if (session.status === "completed") return { ok: true };

  const { error: updateError } = await admin
    .from("assessment_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (updateError) return { ok: false, status: 500, error: updateError.message };

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

  scheduleReports(admin, sessionId, student?.school_id ?? null, session.cycle_id, { notify: true });
  return { ok: true };
}

/**
 * Re-renders a completed session's PDF and its school's cycle report in
 * the background, after something changed its scores (a reviewed
 * read-aloud answer, writing scores entered later).
 */
export async function rescoreAndRegenerate(admin: AdminClient, sessionId: string): Promise<void> {
  const { data: session } = await admin
    .from("assessment_sessions")
    .select("student_id, cycle_id, students(school_id)")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error(`Session ${sessionId} not found`);

  await scoreSession(admin, sessionId);
  await admin.from("student_reports").update({ status: "pending" }).eq("session_id", sessionId);

  const schoolId = (session as unknown as { students: { school_id: string } | null }).students?.school_id ?? null;
  scheduleReports(admin, sessionId, schoolId, session.cycle_id, { notify: false });
}

function scheduleReports(
  admin: AdminClient,
  sessionId: string,
  schoolId: string | null,
  cycleId: string,
  { notify }: { notify: boolean }
) {
  after(async () => {
    try {
      await generateStudentReport(sessionId, { notify });
    } catch (err) {
      console.error(`generateStudentReport failed for session ${sessionId}`, err);
      await markStudentReportFailed(admin, sessionId, err);
    }

    if (schoolId) {
      try {
        await generateSchoolReport(schoolId, cycleId);
      } catch (err) {
        console.error(`generateSchoolReport failed for school ${schoolId}`, err);
        await markSchoolReportFailed(admin, schoolId, cycleId, err);
      }
    }
  });
}
