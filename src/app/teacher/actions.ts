"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSessionForStudent } from "@/lib/sessions";
import { formLabel, isAssessmentForm, isValidLevel, levelLabel } from "@/lib/levels";

export interface AddStudentState {
  error: string | null;
  result: { name: string } | null;
}

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
  const level = Number(formData.get("level") ?? 1);
  if (!name) return { error: "Name is required", result: null };
  if (!isValidLevel(level)) return { error: "Pick a level from the list", result: null };

  // Generating the id ourselves (rather than chaining .select() to read it
  // back via RETURNING) sidesteps a Postgres RLS quirk verified on this
  // project: INSERT ... RETURNING can fail the students SELECT policy even
  // though the identical row is immediately selectable via a plain,
  // separate SELECT through that same policy.
  const { error } = await supabase
    .from("students")
    .insert({ id: randomUUID(), school_id: profile.school_id, teacher_id: user.id, name, level });
  if (error) return { error: error.message, result: null };

  revalidatePath("/teacher");
  return { error: null, result: { name } };
}

/**
 * Starts the assessment the teacher picked (Form A, B, C or the Final
 * assessment) at the student's level, in the school's current cycle, and
 * opens the assessor screen (Assessment Service, TRD §4.1). If the student
 * already has an unfinished ReadWell session in this cycle, that one opens
 * instead: finish or cancel it before starting another. Runs as the
 * signed-in teacher's own session, so RLS limits it to students they can
 * already access.
 */
export async function startAssessment(studentId: string, form: string) {
  if (!isAssessmentForm(form)) throw new Error("Pick Form A, B, C or the Final assessment");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, level, school_id")
    .eq("id", studentId)
    .single();
  if (studentError || !student) throw new Error("Student not found or not accessible");

  const { data: cycle } = await supabase
    .from("assessment_cycles")
    .select("id")
    .eq("school_id", student.school_id)
    .eq("is_current", true)
    .maybeSingle();
  if (!cycle) throw new Error("No active assessment cycle for this school");

  // Kiosk sessions from before levels (form null) can't be resumed here,
  // so they don't block a new assessment.
  const { data: unfinished } = await supabase
    .from("assessment_sessions")
    .select("id, assessments!inner(form)")
    .eq("student_id", studentId)
    .eq("cycle_id", cycle.id)
    .neq("status", "completed")
    .not("assessments.form", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (unfinished) redirect(`/teacher/assess/${unfinished.id}`);

  const session = await createSessionForStudent(supabase, {
    studentId,
    schoolId: student.school_id,
    level: student.level,
    form,
    createdBy: user.id,
  });
  if (!session.ok) {
    throw new Error(
      session.reason === "no_cycle"
        ? "No active assessment cycle for this school"
        : `${formLabel(form)} hasn't been added for ${levelLabel(student.level)} yet`
    );
  }

  revalidatePath("/teacher");
  redirect(`/teacher/assess/${session.id}`);
}

/**
 * Abandons a not-yet-completed session (e.g. started by mistake, or the
 * wrong form was picked). RLS (assessment_sessions_delete_staff, 0007)
 * independently restricts this to teacher/administrator and blocks it for
 * completed sessions.
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
