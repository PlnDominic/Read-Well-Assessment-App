"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateSessionCode } from "@/lib/kiosk";

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

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id")
    .eq("grade_level", student.grade)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (assessmentError || !assessment) {
    throw new Error(`No active assessment configured for grade ${student.grade}`);
  }

  let sessionId: string | null = null;
  for (let attempt = 0; attempt < 5 && !sessionId; attempt++) {
    const { data: created, error: createError } = await supabase
      .from("assessment_sessions")
      .insert({
        student_id: studentId,
        assessment_id: assessment.id,
        cycle_id: cycle.id,
        session_code: generateSessionCode(),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (created) sessionId = created.id;
    else if (createError && !createError.message.includes("session_code")) throw createError;
  }
  if (!sessionId) throw new Error("Could not allocate a session code — try again");

  redirect(`/student/session/${sessionId}`);
}
