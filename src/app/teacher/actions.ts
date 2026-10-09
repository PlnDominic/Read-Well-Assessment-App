"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionForStudent, overrideStudentGrade } from "@/lib/kiosk";
import { gradeLabel, isValidGrade } from "@/lib/grades";
import { isAssessorLed } from "@/lib/readwell/form";
import type { AssessmentItem } from "@/lib/database.types";

export interface AddStudentState {
  error: string | null;
  result: { name: string; sessionCode: string | null; note: string | null } | null;
}

// KG 1 (ReadWell Level 1) has no kiosk code to hand out.
const ASSESSOR_LED_NOTE =
  "Given one to one by a teacher: use Start Assessment on the class roster to open the assessor screen.";

const NO_SESSION_NOTES: Record<"no_cycle" | "no_assessment", (grade: number) => string> = {
  no_cycle: () =>
    "No active assessment cycle yet. An administrator needs to start one at /admin/cycles. Come back and click \"Start Assessment\" once that's done.",
  no_assessment: (grade) =>
    `No active assessment configured for ${gradeLabel(grade)} yet. An administrator needs to set one up at /admin/content. Come back and click "Start Assessment" once that's done.`,
};

/**
 * Lets a teacher add a student to their own roster. RLS
 * (students_insert_teacher_or_admin) independently enforces role='teacher'
 * and teacher_id=auth.uid(), so this can't be used to add a student under
 * anyone else even if called directly.
 */
export async function addStudentToOwnRoster(
  _prevState: AddStudentState,
  formData: FormData
): Promise<AddStudentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "teacher") {
    return { error: "Only teachers can add students here", result: null };
  }

  const name = String(formData.get("name") ?? "").trim();
  const grade = Number(formData.get("grade") ?? 1);
  if (!name) return { error: "Name is required", result: null };
  if (!isValidGrade(grade)) return { error: "Pick a grade from the list", result: null };

  // Generating the id ourselves (rather than chaining .select() to read it
  // back via RETURNING) sidesteps a Postgres RLS quirk verified on this
  // project: INSERT ... RETURNING can fail the students SELECT policy even
  // though the identical row is immediately selectable via a plain,
  // separate SELECT through that same policy.
  const studentId = randomUUID();
  const { error } = await supabase
    .from("students")
    .insert({ id: studentId, school_id: profile.school_id, teacher_id: user.id, name, grade });
  if (error) return { error: error.message, result: null };

  const session = await createSessionForStudent(supabase, {
    studentId,
    schoolId: profile.school_id,
    grade,
    createdBy: user.id,
  });

  revalidatePath("/teacher");
  return {
    error: null,
    result: {
      name,
      sessionCode: session.ok && !session.assessorLed ? session.sessionCode : null,
      note: !session.ok ? NO_SESSION_NOTES[session.reason](grade) : session.assessorLed ? ASSESSOR_LED_NOTE : null,
    },
  };
}

/**
 * Teacher-initiated session start/resume (Assessment Service, TRD §4.1).
 * Runs as the signed-in teacher's own session so RLS enforces that they
 * can only do this for students they can already access.
 */
export async function startOrResumeAssessment(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, grade, school_id")
    .eq("id", studentId)
    .single();
  if (studentError || !student) throw new Error("Student not found or not accessible");

  const { data: cycle, error: cycleError } = await supabase
    .from("assessment_cycles")
    .select("id")
    .eq("school_id", student.school_id)
    .eq("is_current", true)
    .single();
  if (cycleError || !cycle) throw new Error("No active assessment cycle for this school");

  const { data: existing } = await supabase
    .from("assessment_sessions")
    .select("id")
    .eq("student_id", studentId)
    .eq("cycle_id", cycle.id)
    .neq("status", "completed")
    .maybeSingle();

  if (existing) redirect(await sessionPath(supabase, existing.id));

  const session = await createSessionForStudent(supabase, {
    studentId,
    schoolId: student.school_id,
    grade: student.grade,
    createdBy: user.id,
  });
  if (!session.ok) {
    throw new Error(
      session.reason === "no_cycle"
        ? "No active assessment cycle for this school"
        : `No active assessment configured for ${gradeLabel(student.grade)}`
    );
  }

  redirect(await sessionPath(supabase, session.id));
}

/**
 * Where staff go to run a session: the assessor screen for assessor-led
 * forms (ReadWell Level 1, KG 1), where the adult scores each item, or
 * the student kiosk for everything else.
 */
async function sessionPath(supabase: Awaited<ReturnType<typeof createClient>>, sessionId: string): Promise<string> {
  const { data } = await supabase.from("assessment_sessions").select("assessments(items)").eq("id", sessionId).single();
  const items = (data as unknown as { assessments: { items: AssessmentItem[] } | null } | null)?.assessments?.items ?? [];
  return isAssessorLed(items) ? `/teacher/assess/${sessionId}` : `/student/session/${sessionId}`;
}

/**
 * Abandons a not-yet-completed session (e.g. started by mistake, or the
 * kiosk device needs a fresh code). RLS
 * (assessment_sessions_delete_staff, 0007) independently restricts this to
 * teacher/administrator and blocks it for completed sessions.
 */
export async function cancelSession(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Missing session id");

  const { error } = await supabase.from("assessment_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);

  revalidatePath("/teacher");
}

/**
 * Explicit grade override (PRD §4.1: assigning a mismatched-grade
 * assessment "is blocked or requires explicit override with a warning").
 * The warning itself is the confirm dialog in GradeOverrideControl.tsx;
 * this is what runs once staff have confirmed it. Available to teachers
 * (their own students) and administrators (any student in their school),
 * same roles RLS already allows to create/cancel a session at all.
 */
export async function overrideAssessmentGrade(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "teacher" && profile.role !== "administrator")) {
    throw new Error("Only a teacher or administrator can override a student's assessment grade");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const requestedGrade = Number(formData.get("gradeLevel"));
  if (!studentId || !isValidGrade(requestedGrade)) throw new Error("Missing student or grade");

  // RLS-scoped read: can_access_student() limits a teacher to their own
  // students and an administrator to their own school.
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("grade, school_id")
    .eq("id", studentId)
    .single();
  if (studentError || !student) throw new Error("Student not found or not accessible");

  const admin = createAdminClient();
  const result = await overrideStudentGrade(supabase, admin, {
    studentId,
    schoolId: student.school_id,
    currentGrade: student.grade,
    requestedGrade,
    createdBy: user.id,
  });
  if (!result.ok) throw new Error(result.error);

  revalidatePath("/teacher");
  revalidatePath("/admin/students");
}
