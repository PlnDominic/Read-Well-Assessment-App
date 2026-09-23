"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createSessionForStudent } from "@/lib/kiosk";

export interface AddStudentState {
  error: string | null;
  result: { name: string; sessionCode: string | null; note: string | null } | null;
}

const NO_SESSION_NOTES: Record<"no_cycle" | "no_assessment", (grade: number) => string> = {
  no_cycle: () =>
    "No active assessment cycle yet. Start one on the Cycles tab first, then use Start Assessment on the Teacher roster once that's done.",
  no_assessment: (grade) =>
    `No active assessment configured for grade ${grade} yet. Set one up on the Content tab first, then use Start Assessment on the Teacher roster once that's done.`,
};

export async function addStudent(
  _prevState: AddStudentState,
  formData: FormData
): Promise<AddStudentState> {
  const { supabase, profile } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const grade = Number(formData.get("grade") ?? 1);
  const teacherId = String(formData.get("teacherId") ?? "");
  if (!name || !teacherId) return { error: "Name and teacher are required", result: null };

  // Generating the id ourselves (rather than chaining .select() to read it
  // back via RETURNING) sidesteps a Postgres RLS quirk verified on this
  // project: INSERT ... RETURNING can fail the students SELECT policy even
  // though the identical row is immediately selectable via a plain,
  // separate SELECT through that same policy.
  const studentId = randomUUID();
  const { error } = await supabase
    .from("students")
    .insert({ id: studentId, school_id: profile.school_id, teacher_id: teacherId, name, grade });
  if (error) return { error: error.message, result: null };

  const session = await createSessionForStudent(supabase, {
    studentId,
    schoolId: profile.school_id,
    grade,
    createdBy: profile.id,
  });

  revalidatePath("/admin/students");
  return {
    error: null,
    result: {
      name,
      sessionCode: session.ok ? session.sessionCode : null,
      note: session.ok ? null : NO_SESSION_NOTES[session.reason](grade),
    },
  };
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
 * (a simple comma split, fields containing commas aren't supported).
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
