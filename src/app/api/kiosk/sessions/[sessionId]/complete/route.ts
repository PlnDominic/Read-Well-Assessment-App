import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreSession } from "@/lib/scoring";
import { generateSchoolReport, generateStudentReport } from "@/lib/reports";

/**
 * POST /api/kiosk/sessions/:id/complete — Assessment Service "complete"
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

  after(async () => {
    try {
      await generateStudentReport(sessionId);
    } catch (err) {
      console.error(`generateStudentReport failed for session ${sessionId}`, err);
      await admin.from("student_reports").update({ status: "failed" }).eq("session_id", sessionId);
    }

    if (student?.school_id) {
      try {
        await generateSchoolReport(student.school_id, session.cycle_id);
      } catch (err) {
        console.error(`generateSchoolReport failed for school ${student.school_id}`, err);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
