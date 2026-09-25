import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStudentReportPageData } from "@/lib/reports";
import { BulkStudentReportsPdf } from "@/lib/pdf/BulkStudentReportsPdf";

/**
 * Bundles every one of the caller's accessible students' latest completed
 * assessment into one downloadable PDF: a teacher's whole class, a
 * specialist's assigned group, or (for an administrator) the whole school.
 * Scoping comes entirely from the caller's own role via the RLS-scoped
 * client -- the same `students` read the roster pages themselves use --
 * rather than branching on role here. Per-session data reads then go
 * through the service-role client scoped to exactly those ids (same
 * pattern as generateStudentReport/generateSchoolReport in lib/reports.ts),
 * since buildStudentReportPageData's getRecommendations() call is typed
 * for that client.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("id, name").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: students } = await supabase.from("students").select("id, name, grade").order("name");
  if (!students || students.length === 0) {
    return NextResponse.json({ error: "No students to export" }, { status: 404 });
  }

  const admin = createAdminClient();
  const reports = [];
  for (const student of students) {
    const { data: session } = await admin
      .from("assessment_sessions")
      .select("id, completed_at, assessment_id")
      .eq("student_id", student.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!session) continue;

    const { data: assessment } = await admin
      .from("assessments")
      .select("grade_level")
      .eq("id", session.assessment_id)
      .single();

    reports.push(
      await buildStudentReportPageData(admin, {
        sessionId: session.id,
        studentName: student.name,
        displayGrade: student.grade,
        contentGradeLevel: assessment?.grade_level ?? student.grade,
        completedAt: session.completed_at,
      })
    );
  }

  if (reports.length === 0) {
    return NextResponse.json({ error: "None of your students have a completed assessment yet" }, { status: 404 });
  }

  const pdfBuffer = await renderToBuffer(
    createElement(BulkStudentReportsPdf, {
      title: `${profile.name}'s Class Reports`,
      reports,
    }) as unknown as ReactElement<DocumentProps>
  );

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "report.export_bulk",
    resource_type: "class",
    resource_id: profile.id,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="class-reports.pdf"`,
    },
  });
}
