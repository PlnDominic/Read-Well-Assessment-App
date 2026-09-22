"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";

export async function addStudent(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const grade = Number(formData.get("grade") ?? 1);
  const teacherId = String(formData.get("teacherId") ?? "");
  if (!name || !teacherId) throw new Error("Name and teacher are required");

  const { error } = await supabase.from("students").insert({
    school_id: profile.school_id,
    teacher_id: teacherId,
    name,
    grade,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/students");
}

export async function assignSpecialist(formData: FormData) {
  const { supabase } = await requireAdmin();

  const studentId = String(formData.get("studentId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");
  if (!studentId || !specialistId) throw new Error("Student and specialist are required");

  const { error } = await supabase
    .from("specialist_assignments")
    .insert({ student_id: studentId, specialist_id: specialistId });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/students");
}

export async function unassignSpecialist(formData: FormData) {
  const { supabase } = await requireAdmin();

  const studentId = String(formData.get("studentId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");

  const { error } = await supabase
    .from("specialist_assignments")
    .delete()
    .eq("student_id", studentId)
    .eq("specialist_id", specialistId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/students");
}
