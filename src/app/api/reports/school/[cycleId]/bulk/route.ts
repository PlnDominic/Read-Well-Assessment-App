import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStudentReportPageData } from "@/lib/reports";
import { BulkStudentReportsPdf } from "@/lib/pdf/BulkStudentReportsPdf";

type SessionRow = {
  id: string;
  completed_at: string | null;
  assessment_id: string;
  students: { id: string; name: string; grade: number } | null;
};

/**
 * Every completed assessment in this cycle, school-wide, as one PDF --
 * the "or cycle" counterpart to /api/reports/class. Session listing uses
 * requireAdmin()'s RLS-scoped client (same pattern as the CSV export route:
 * an administrator's own session sees the whole school already); per-
 * session data reads go through the service-role client, same reason as
 * /api/reports/class.
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
    .select("id, completed_at, assessment_id, students(id, name, grade)")
    .eq("cycle_id", cycleId)
    .eq("status", "completed");
  if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  const sessions = (sessionsRaw ?? []) as unknown as SessionRow[];

  const admin = createAdminClient();
  const reports = [];
  for (const session of sessions) {
    if (!session.students) continue;

    const { data: assessment } = await admin
      .from("assessments")
      .select("grade_level")
      .eq("id", session.assessment_id)
      .single();

    reports.push(
      await buildStudentReportPageData(admin, {
        sessionId: session.id,
        studentName: session.students.name,
        displayGrade: session.students.grade,
        contentGradeLevel: assessment?.grade_level ?? session.students.grade,
        completedAt: session.completed_at,
      })
    );
  }

  if (reports.length === 0) {
    return NextResponse.json({ error: "No completed assessments in this cycle yet" }, { status: 404 });
  }
  reports.sort((a, b) => a.studentName.localeCompare(b.studentName));

  const pdfBuffer = await renderToBuffer(
    createElement(BulkStudentReportsPdf, {
      title: `${cycle.name} - All Reports`,
      reports,
    }) as unknown as ReactElement<DocumentProps>
  );

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "report.export_bulk",
    resource_type: "school_report",
    resource_id: cycleId,
  });

  const filename = `${cycle.name.replace(/[^a-z0-9]+/gi, "-")}-all-reports.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
