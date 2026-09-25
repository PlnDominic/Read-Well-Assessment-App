import "server-only";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRecommendations } from "@/lib/recommendations";
import { computeOverallLabel, computeWeightedAverage } from "@/lib/scoring";
import { StudentReportPdf, type StudentReportPageProps } from "@/lib/pdf/StudentReportPdf";
import { SchoolReportPdf } from "@/lib/pdf/SchoolReportPdf";
import { appUrl, escapeHtml, sendEmail } from "@/lib/email";

type AdminClient = ReturnType<typeof createAdminClient>;

const REPORTS_BUCKET = "reports";

/**
 * Fetches and shapes one completed session's data into the props
 * StudentReportPage needs: shared by generateStudentReport (renders +
 * stores one PDF) and the bulk class/cycle export routes (render many of
 * these into one Document via BulkStudentReportsPdf, without storing
 * anything -- see /api/reports/class and /api/reports/school/[cycleId]/bulk).
 */
export async function buildStudentReportPageData(
  admin: AdminClient,
  params: { sessionId: string; studentName: string; displayGrade: number; contentGradeLevel: number; completedAt: string | null }
): Promise<StudentReportPageProps> {
  const { data: results, error: resultsError } = await admin
    .from("results")
    .select("score, flagged_as_difficulty, skill_areas(id, name)")
    .eq("session_id", params.sessionId);
  if (resultsError) throw resultsError;

  type ResultRow = { score: number; flagged_as_difficulty: boolean; skill_areas: { id: string; name: string } };
  const rows = (results ?? []) as unknown as ResultRow[];

  const skills = rows.map((r) => ({ name: r.skill_areas.name, score: r.score, flagged: r.flagged_as_difficulty }));
  const flaggedSkillAreaIds = rows.filter((r) => r.flagged_as_difficulty).map((r) => r.skill_areas.id);

  const recs = await getRecommendations(admin, flaggedSkillAreaIds, params.contentGradeLevel);
  const overallLabel = computeOverallLabel(flaggedSkillAreaIds.length);

  return {
    studentName: params.studentName,
    grade: params.displayGrade,
    assessedDate: new Date(params.completedAt ?? Date.now()).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    overallLabel,
    skills,
    recommendations: recs.map((r) => ({
      skillName: r.skillAreaName,
      text: r.text,
      programReference: r.programReference,
    })),
  };
}

/**
 * Report Generation Service (TRD §4.4/§5): renders and stores the
 * per-student PDF. Called via `after()` from the session-completion route
 * so a slow render never blocks the student/teacher-facing response.
 */
export async function generateStudentReport(sessionId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: session, error: sessionError } = await admin
    .from("assessment_sessions")
    .select("id, student_id, completed_at, assessments(grade_level)")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) throw new Error(`Session ${sessionId} not found`);

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("name, grade, teacher_id")
    .eq("id", session.student_id)
    .single();
  if (studentError || !student) throw new Error(`Student for session ${sessionId} not found`);

  // @ts-expect-error -- joined relation shape isn't modeled in database.types.ts
  const gradeLevel: number = session.assessments?.grade_level ?? student.grade;
  const pageData = await buildStudentReportPageData(admin, {
    sessionId,
    studentName: student.name,
    displayGrade: student.grade,
    contentGradeLevel: gradeLevel,
    completedAt: session.completed_at,
  });

  const pdfBuffer = await renderToBuffer(
    createElement(StudentReportPdf, pageData) as unknown as ReactElement<DocumentProps>
  );

  const pdfPath = `student/${sessionId}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(REPORTS_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw uploadError;

  const { error: upsertError } = await admin
    .from("student_reports")
    .upsert(
      {
        student_id: session.student_id,
        session_id: sessionId,
        overall_label: pageData.overallLabel,
        pdf_path: pdfPath,
        status: "ready",
      },
      { onConflict: "session_id" }
    );
  if (upsertError) throw upsertError;

  const reportLink = `/teacher/students/${session.student_id}/report?session=${sessionId}`;
  await admin.from("notifications").insert({
    recipient_id: student.teacher_id,
    type: "student_report_ready",
    message: `${student.name}'s report is ready.`,
    link: reportLink,
  });

  const { data: teacher } = await admin.from("profiles").select("name, email").eq("id", student.teacher_id).single();
  if (teacher?.email) {
    await sendEmail({
      to: teacher.email,
      subject: `${student.name}'s reading report is ready`,
      html: `<p>Hi ${escapeHtml(teacher.name)},</p><p><a href="${appUrl(reportLink)}">${escapeHtml(
        student.name
      )}'s report</a> is ready to view.</p>`,
    });
  }
}

/**
 * Report Generation Service (TRD §4.4/§5): aggregates every completed
 * session in a cycle into the school-wide PDF. Re-run after each student
 * completion so the report stays current (PRD §4.4: "auto-updated as
 * assessments in a cycle are completed").
 */
export async function generateSchoolReport(schoolId: string, cycleId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: school, error: schoolError } = await admin
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .single();
  if (schoolError || !school) throw new Error(`School ${schoolId} not found`);

  const { data: cycle, error: cycleError } = await admin
    .from("assessment_cycles")
    .select("name")
    .eq("id", cycleId)
    .single();
  if (cycleError || !cycle) throw new Error(`Cycle ${cycleId} not found`);

  const { count: studentsTotal } = await admin
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);

  const { data: sessions, error: sessionsError } = await admin
    .from("assessment_sessions")
    .select("id, student_id, students!inner(school_id, grade)")
    .eq("cycle_id", cycleId)
    .eq("status", "completed")
    .eq("students.school_id", schoolId);
  if (sessionsError) throw sessionsError;

  const sessionIds = sessions.map((s) => s.id);
  const studentsAssessed = new Set(sessions.map((s) => s.student_id)).size;
  // @ts-expect-error -- joined relation shape isn't modeled in database.types.ts
  const gradeLevel: number = sessions[0]?.students?.grade ?? 1;

  let avgOverallScore = 0;
  const skillDistribution: { name: string; pctFlagged: number }[] = [];

  if (sessionIds.length > 0) {
    const { data: results, error: resultsError } = await admin
      .from("results")
      .select("session_id, score, flagged_as_difficulty, skill_areas(id, name)")
      .in("session_id", sessionIds);
    if (resultsError) throw resultsError;

    type ResultRow = {
      session_id: string;
      score: number;
      flagged_as_difficulty: boolean;
      skill_areas: { id: string; name: string };
    };
    const rows = (results ?? []) as unknown as ResultRow[];

    const { data: weightRows } = await admin
      .from("school_skill_weights")
      .select("skill_area_id, weight")
      .eq("school_id", schoolId);
    const weightBySkillAreaId = new Map((weightRows ?? []).map((w) => [w.skill_area_id, w.weight]));

    avgOverallScore = computeWeightedAverage(
      rows.map((r) => ({ score: r.score, skillAreaId: r.skill_areas.id })),
      weightBySkillAreaId
    );

    const bySkill = new Map<string, { name: string; flagged: number; total: number }>();
    for (const r of rows) {
      const bucket = bySkill.get(r.skill_areas.id) ?? { name: r.skill_areas.name, flagged: 0, total: 0 };
      bucket.total += 1;
      if (r.flagged_as_difficulty) bucket.flagged += 1;
      bySkill.set(r.skill_areas.id, bucket);
    }
    for (const { name, flagged, total } of bySkill.values()) {
      skillDistribution.push({ name, pctFlagged: total > 0 ? Math.round((flagged / total) * 100) : 0 });
    }
    skillDistribution.sort((a, b) => b.pctFlagged - a.pctFlagged);
  }

  const topFlagged = skillDistribution.slice(0, 2).map((s) => s.name);
  const planningNote =
    topFlagged.length > 0
      ? `${topFlagged.join(" and ")} ${topFlagged.length > 1 ? "are" : "is"} the most common flagged area${
          topFlagged.length > 1 ? "s" : ""
        } this cycle. Consider prioritizing intervention resources for ${
          topFlagged.length > 1 ? "these skill areas" : "this skill area"
        } across Grade ${gradeLevel} classrooms.`
      : "No skill areas are broadly flagged this cycle.";

  const pdfBuffer = await renderToBuffer(
    createElement(SchoolReportPdf, {
      schoolName: school.name,
      cycleName: cycle.name,
      studentsAssessed,
      studentsTotal: studentsTotal ?? 0,
      gradeLevel,
      avgOverallScore,
      skillDistribution,
      planningNote,
    }) as unknown as ReactElement<DocumentProps>
  );

  const pdfPath = `school/${schoolId}-${cycleId}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(REPORTS_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw uploadError;

  const { error: upsertError } = await admin
    .from("school_reports")
    .upsert({ school_id: schoolId, cycle_id: cycleId, pdf_path: pdfPath, status: "ready" }, { onConflict: "school_id,cycle_id" });
  if (upsertError) throw upsertError;

  const { data: admins } = await admin
    .from("profiles")
    .select("id, name, email")
    .eq("school_id", schoolId)
    .eq("role", "administrator");
  if (admins && admins.length > 0) {
    await admin.from("notifications").insert(
      admins.map((a) => ({
        recipient_id: a.id,
        type: "school_report_ready",
        message: `The ${cycle.name} school-wide report is ready.`,
        link: "/admin",
      }))
    );
    await Promise.all(
      admins
        .filter((a) => a.email)
        .map((a) =>
          sendEmail({
            to: a.email,
            subject: `${cycle.name} school-wide report is ready`,
            html: `<p>Hi ${escapeHtml(a.name)},</p><p>The <a href="${appUrl("/admin")}">${escapeHtml(
              cycle.name
            )} school-wide report</a> is ready to view.</p>`,
          })
        )
    );
  }
}
