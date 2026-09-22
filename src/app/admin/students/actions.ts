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

export async function updateStudent(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const grade = Number(formData.get("grade") ?? 1);
  const teacherId = String(formData.get("teacherId") ?? "");
  if (!id || !name || !teacherId) throw new Error("Name and teacher are required");

  const { error } = await supabase
    .from("students")
    .update({ name, grade, teacher_id: teacherId })
    .eq("id", id)
    .eq("school_id", profile.school_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/students");
}

export async function deleteStudent(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing student id");

  const { error } = await supabase.from("students").delete().eq("id", id).eq("school_id", profile.school_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/students");
}

export interface ImportCsvState {
  error: string | null;
  summary: { inserted: number; rowErrors: string[] } | null;
}

/**
 * Expects a CSV with a header row: name,grade,teacher_email
 * (a simple comma split — fields containing commas aren't supported).
 */
export async function importStudentsCsv(
  _prevState: ImportCsvState,
  formData: FormData
): Promise<ImportCsvState> {
  const { supabase, profile } = await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file first.", summary: null };
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "The file is empty.", summary: null };

  const first = lines[0].toLowerCase();
  const dataLines = first.startsWith("name,") ? lines.slice(1) : lines;

  const { data: teachers } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("school_id", profile.school_id)
    .eq("role", "teacher");
  const teacherIdByEmail = new Map((teachers ?? []).map((t) => [t.email.toLowerCase(), t.id]));

  const rowErrors: string[] = [];
  const rowsToInsert: { school_id: string; teacher_id: string; name: string; grade: number }[] = [];

  dataLines.forEach((line, i) => {
    const rowNum = i + (first.startsWith("name,") ? 2 : 1);
    const [name, gradeRaw, teacherEmail] = line.split(",").map((v) => v?.trim());
    if (!name || !gradeRaw || !teacherEmail) {
      rowErrors.push(`Row ${rowNum}: expected "name,grade,teacher_email"`);
      return;
    }
    const grade = Number(gradeRaw);
    if (!Number.isInteger(grade) || grade < 1) {
      rowErrors.push(`Row ${rowNum}: invalid grade "${gradeRaw}"`);
      return;
    }
    const teacherId = teacherIdByEmail.get(teacherEmail.toLowerCase());
    if (!teacherId) {
      rowErrors.push(`Row ${rowNum}: no teacher found with email ${teacherEmail}`);
      return;
    }
    rowsToInsert.push({ school_id: profile.school_id, teacher_id: teacherId, name, grade });
  });

  let inserted = 0;
  if (rowsToInsert.length > 0) {
    const { error, count } = await supabase.from("students").insert(rowsToInsert, { count: "exact" });
    if (error) return { error: error.message, summary: null };
    inserted = count ?? rowsToInsert.length;
  }

  revalidatePath("/admin/students");
  return { error: null, summary: { inserted, rowErrors } };
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
