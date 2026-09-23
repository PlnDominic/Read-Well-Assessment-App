import "server-only";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRecommendations } from "@/lib/recommendations";
import { computeOverallLabel } from "@/lib/scoring";
import { StudentReportPdf } from "@/lib/pdf/StudentReportPdf";
import { SchoolReportPdf } from "@/lib/pdf/SchoolReportPdf";

const REPORTS_BUCKET = "reports";

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

  const { data: results, error: resultsError } = await admin
    .from("results")
    .select("score, flagged_as_difficulty, skill_areas(id, name)")
    .eq("session_id", sessionId);
  if (resultsError) throw resultsError;

  type ResultRow = { score: number; flagged_as_difficulty: boolean; skill_areas: { id: string; name: string } };
  const rows = (results ?? []) as unknown as ResultRow[];

  const skills = rows.map((r) => ({ name: r.skill_areas.name, score: r.score }));
  const flaggedSkillAreaIds = rows.filter((r) => r.flagged_as_difficulty).map((r) => r.skill_areas.id);

  // @ts-expect-error -- joined relation shape isn't modeled in database.types.ts
  const gradeLevel: number = session.assessments?.grade_level ?? student.grade;
  const recs = await getRecommendations(admin, flaggedSkillAreaIds, gradeLevel);
  const overallLabel = computeOverallLabel(flaggedSkillAreaIds.length);

  const pdfBuffer = await renderToBuffer(
    createElement(StudentReportPdf, {
      studentName: student.name,
      grade: student.grade,
      assessedDate: new Date(session.completed_at ?? Date.now()).toLocaleDateString("en-US", {
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
    }) as unknown as ReactElement<DocumentProps>
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
        overall_label: overallLabel,
        pdf_path: pdfPath,
        status: "ready",
      },
      { onConflict: "session_id" }
    );
  if (upsertError) throw upsertError;

  await admin.from("notifications").insert({
    recipient_id: student.teacher_id,
    type: "student_report_ready",
    message: `${student.name}'s report is ready.`,
    link: `/teacher/students/${session.student_id}/report?session=${sessionId}`,
  });
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

    avgOverallScore = rows.length > 0 ? Math.round(rows.reduce((sum, r) => sum + r.score, 0) / rows.length) : 0;

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
    .select("id")
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
  }
}
