"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSessionForStudent } from "@/lib/kiosk";

export interface AddStudentState {
  error: string | null;
  result: { name: string; sessionCode: string | null; note: string | null } | null;
}

const NO_SESSION_NOTES: Record<"no_cycle" | "no_assessment", (grade: number) => string> = {
  no_cycle: () =>
    "No active assessment cycle yet. An administrator needs to start one at /admin/cycles. Come back and click \"Start Assessment\" once that's done.",
  no_assessment: (grade) =>
    `No active assessment configured for grade ${grade} yet. An administrator needs to set one up at /admin/content. Come back and click "Start Assessment" once that's done.`,
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
      sessionCode: session.ok ? session.sessionCode : null,
      note: session.ok ? null : NO_SESSION_NOTES[session.reason](grade),
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

  if (existing) redirect(`/student/session/${existing.id}`);

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
        : `No active assessment configured for grade ${student.grade}`
    );
  }

  redirect(`/student/session/${session.id}`);
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
