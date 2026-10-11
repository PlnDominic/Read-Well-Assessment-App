import "server-only";
import { randomUUID } from "crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import type { AssessmentForm, Delivery } from "@/lib/levels";
import { generateSessionCode } from "@/lib/kiosk";
import { scoreSession } from "@/lib/scoring";
import { generateSchoolReport, generateStudentReport, markSchoolReportFailed, markStudentReportFailed } from "@/lib/reports";

type AdminClient = ReturnType<typeof createAdminClient>;

export type CreateSessionResult =
  /** game: the form is played by the child on their own device, so sessionCode is the code they type at /student/join. Assessor-led forms have no code. */
  | { ok: true; id: string; game: boolean; sessionCode: string | null }
  | { ok: false; reason: "no_cycle" | "no_assessment" };

/**
 * Creates a not-yet-started session for a student at their level, for the
 * form the teacher picked (A, B, C or the Final assessment) and the way
 * it's given (by an adult, or as a game), in the school's current cycle. Returns `ok: false` rather than throwing when
 * there's no current cycle or that form hasn't been added for the level
 * yet: normal, fixable setup gaps, not errors.
 *
 * `supabase` is the caller's own RLS-scoped client, so
 * assessment_sessions_insert_staff (0004) decides who may do this: a
 * teacher for their own students, an administrator for their school.
 */
export async function createSessionForStudent(
  supabase: SupabaseClient<Database>,
  params: { studentId: string; schoolId: string; level: number; form: AssessmentForm; delivery: Delivery; createdBy: string }
): Promise<CreateSessionResult> {
  const { data: cycle } = await supabase
    .from("assessment_cycles")
    .select("id")
    .eq("school_id", params.schoolId)
    .eq("is_current", true)
    .maybeSingle();
  if (!cycle) return { ok: false, reason: "no_cycle" };

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id")
    .eq("level", params.level)
    .eq("form", params.form)
    .eq("delivery", params.delivery)
    .eq("is_active", true)
    .maybeSingle();
  if (!assessment) return { ok: false, reason: "no_assessment" };
  const game = params.delivery === "game";

  // A game session gets a code the child types on their own device; a
  // collision with an existing code (unique) just draws another.
  for (let attempt = 0; attempt < 5; attempt++) {
    // Generating the id here rather than chaining .select() (INSERT ...
    // RETURNING) sidesteps a Postgres RLS quirk verified on this project:
    // the RETURNING read can fail the select policy even though the same
    // row is immediately selectable with an ordinary SELECT.
    const id = randomUUID();
    const sessionCode = game ? generateSessionCode() : null;
    const { error } = await supabase.from("assessment_sessions").insert({
      id,
      student_id: params.studentId,
      assessment_id: assessment.id,
      cycle_id: cycle.id,
      created_by: params.createdBy,
      session_code: sessionCode,
    });
    if (!error) return { ok: true, id, game, sessionCode };
    if (!error.message.includes("session_code")) throw error;
  }
  throw new Error("Could not allocate a session code. Try again.");
}

/**
 * Marks a session done, runs the Scoring Service synchronously (fast: a
 * few hundred rows at most), then schedules PDF report generation with
 * `after()` so it never blocks the response (TRD §5). Shared by the
 * student game and the assessor screen; each route does its own
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
