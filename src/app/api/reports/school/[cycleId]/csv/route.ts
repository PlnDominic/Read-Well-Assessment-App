import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeOverallLabel } from "@/lib/scoring";
import { toCsvRow } from "@/lib/csv";

type SessionRow = {
  id: string;
  students: { name: string; grade: number; teacher_id: string } | null;
};
type ResultRow = { session_id: string; score: number; flagged_as_difficulty: boolean; skill_areas: { name: string } };

/**
 * Long-format CSV (one row per student per skill area) for a single
 * assessment cycle. Unlike the PDF export this isn't a stored artifact --
 * it's built on demand from rows the caller can already see via
 * `requireAdmin()`'s RLS-scoped client, the same access the admin
 * dashboard itself reads through.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const { supabase, profile } = await requireAdmin();
  const { cycleId } = await params;

  const { data: cycle } = await supabase
    .from("assessment_cycles")
    .select("id, name")
    .eq("id", cycleId)
    .eq("school_id", profile.school_id)
    .single();
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const { data: sessionsRaw, error: sessionsError } = await supabase
    .from("assessment_sessions")
    .select("id, students(name, grade, teacher_id)")
    .eq("cycle_id", cycleId)
    .eq("status", "completed");
  if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  const sessions = (sessionsRaw ?? []) as unknown as SessionRow[];

  const sessionIds = sessions.map((s) => s.id);
  const { data: resultsRaw } = sessionIds.length
    ? await supabase
        .from("results")
        .select("session_id, score, flagged_as_difficulty, skill_areas(name)")
        .in("session_id", sessionIds)
    : { data: [] };
  const results = (resultsRaw ?? []) as unknown as ResultRow[];

  const resultsBySession = new Map<string, ResultRow[]>();
  for (const r of results) {
    const bucket = resultsBySession.get(r.session_id) ?? [];
    bucket.push(r);
    resultsBySession.set(r.session_id, bucket);
  }

  const teacherIds = [...new Set(sessions.map((s) => s.students?.teacher_id).filter((id): id is string => !!id))];
  const { data: teachers } = teacherIds.length
    ? await supabase.from("profiles").select("id, name").in("id", teacherIds)
    : { data: [] };
  const teacherNameById = new Map((teachers ?? []).map((t) => [t.id, t.name]));

  const lines = [toCsvRow(["student_name", "grade", "teacher_name", "skill_area", "score", "flagged", "overall_label"])];
  for (const session of sessions) {
    if (!session.students) continue;
    const sessionResults = resultsBySession.get(session.id) ?? [];
    const overallLabel = computeOverallLabel(sessionResults.filter((r) => r.flagged_as_difficulty).length);
    const teacherName = teacherNameById.get(session.students.teacher_id) ?? "";
    for (const r of sessionResults) {
      lines.push(
        toCsvRow([
          session.students.name,
          session.students.grade,
          teacherName,
          r.skill_areas.name,
          r.score,
          r.flagged_as_difficulty ? "yes" : "no",
          overallLabel,
        ])
      );
    }
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "report.export_csv",
    resource_type: "school_report",
    resource_id: cycleId,
  });

  const filename = `${cycle.name.replace(/[^a-z0-9]+/gi, "-")}-results.csv`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
