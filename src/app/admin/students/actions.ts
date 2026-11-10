"use server";

import { parseCsvLine } from "@/lib/csv";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidLevel, parseLevel } from "@/lib/levels";

export interface AddStudentState {
  error: string | null;
  result: { name: string } | null;
}

export async function addStudent(
  _prevState: AddStudentState,
  formData: FormData
): Promise<AddStudentState> {
  const { supabase, profile } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const level = Number(formData.get("level") ?? 1);
  const teacherId = String(formData.get("teacherId") ?? "");
  if (!name || !teacherId) return { error: "Name and teacher are required", result: null };
  if (!isValidLevel(level)) return { error: "Pick a level from the list", result: null };

  // Generating the id ourselves (rather than chaining .select() to read it
  // back via RETURNING) sidesteps a Postgres RLS quirk verified on this
  // project: INSERT ... RETURNING can fail the students SELECT policy even
  // though the identical row is immediately selectable via a plain,
  // separate SELECT through that same policy.
  const { error } = await supabase
    .from("students")
    .insert({ id: randomUUID(), school_id: profile.school_id, teacher_id: teacherId, name, level });
  if (error) return { error: error.message, result: null };

  revalidatePath("/admin/students");
  return { error: null, result: { name } };
}

export async function updateStudent(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const level = Number(formData.get("level") ?? 1);
  const teacherId = String(formData.get("teacherId") ?? "");
  if (!id || !name || !teacherId) throw new Error("Name and teacher are required");
  if (!isValidLevel(level)) throw new Error("Pick a level from the list");

  const { error } = await supabase
    .from("students")
    .update({ name, level, teacher_id: teacherId })
    .eq("id", id)
    .eq("school_id", profile.school_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/students");
}

/**
 * Soft delete (supabase/migrations/0010_students_soft_delete.sql): sets
 * deleted_at rather than removing the row, so it's recoverable via
 * restoreStudent and existing assessment history for the student isn't
 * destroyed. Goes through the normal RLS-scoped client -- the update
 * policy doesn't care about deleted_at, only the select policy does.
 */
export async function deleteStudent(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing student id");

  const { error } = await supabase
    .from("students")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("school_id", profile.school_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/students");
}

/**
 * Listing deleted students (for the "Deleted students" panel) needs the
 * service-role client: the select policy filters out deleted_at rows, by
 * design, for every other read in the app.
 *
 * Exported from a "use server" file, so this is also a callable Server
 * Action endpoint, not just a helper for the page: it has to gate itself
 * and take the school from the caller's own profile, never a parameter.
 */
export async function listDeletedStudents() {
  const { profile } = await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("students")
    .select("id, name, level, deleted_at")
    .eq("school_id", profile.school_id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function restoreStudent(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing student id");

  const { error } = await supabase
    .from("students")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("school_id", profile.school_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/students");
}

export interface ImportCsvState {
  error: string | null;
  summary: { inserted: number; rowErrors: string[] } | null;
}

// A roster CSV is a handful of short lines per student; these are generous
// upper bounds meant only to stop a runaway upload from reading an
// unbounded file into memory or inserting an unbounded number of rows.
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 2000;

/**
 * Expects a CSV with a header row: name,level,teacher_email (a name with a
 * comma goes in double quotes). A student already on the roster with the same
 * name, teacher and level is skipped, so uploading the same file twice does
 * not create everyone twice.
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
  // The browser's accept filter is only a hint, so check here too.
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain/i.test(file.type)) {
    return { error: "That doesn't look like a CSV file. Save it as .csv and try again.", summary: null };
  }
  if (file.size > MAX_CSV_BYTES) {
    return { error: `That file is too large (max ${MAX_CSV_BYTES / (1024 * 1024)}MB).`, summary: null };
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "The file is empty.", summary: null };

  const first = lines[0].toLowerCase();
  const dataLines = first.startsWith("name,") ? lines.slice(1) : lines;
  if (dataLines.length > MAX_CSV_ROWS) {
    return { error: `That's ${dataLines.length} rows; please split into batches of ${MAX_CSV_ROWS} or fewer.`, summary: null };
  }

  const { data: teachers } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("school_id", profile.school_id)
    .eq("role", "teacher");
  const teacherIdByEmail = new Map((teachers ?? []).map((t) => [t.email.toLowerCase(), t.id]));

  const rowErrors: string[] = [];
  const rowsToInsert: { school_id: string; teacher_id: string; name: string; level: number }[] = [];

  dataLines.forEach((line, i) => {
    const rowNum = i + (first.startsWith("name,") ? 2 : 1);
    const [name, levelRaw, teacherEmail] = parseCsvLine(line);
    if (!name || !levelRaw || !teacherEmail) {
      rowErrors.push(`Row ${rowNum}: expected "name,level,teacher_email"`);
      return;
    }
    const level = parseLevel(levelRaw);
    if (level === null) {
      rowErrors.push(`Row ${rowNum}: invalid level "${levelRaw}" (use a level number, e.g. 1 or Level 1)`);
      return;
    }
    const teacherId = teacherIdByEmail.get(teacherEmail.toLowerCase());
    if (!teacherId) {
      rowErrors.push(`Row ${rowNum}: no teacher found with email ${teacherEmail}`);
      return;
    }
    rowsToInsert.push({ school_id: profile.school_id, teacher_id: teacherId, name, level });
  });

  // Skip anyone already on the roster (same name, teacher and level), and
  // repeats inside the file itself.
  const { data: existing } = await supabase.from("students").select("name, teacher_id, level").eq("school_id", profile.school_id);
  const key = (r: { name: string; teacher_id: string; level: number }) => `${r.name.trim().toLowerCase()}|${r.teacher_id}|${r.level}`;
  const seen = new Set((existing ?? []).map(key));
  const fresh = rowsToInsert.filter((r) => {
    if (seen.has(key(r))) {
      rowErrors.push(`Skipped ${r.name}: already on the roster`);
      return false;
    }
    seen.add(key(r));
    return true;
  });

  let inserted = 0;
  if (fresh.length > 0) {
    const { error, count } = await supabase.from("students").insert(fresh, { count: "exact" });
    if (error) return { error: error.message, summary: null };
    inserted = count ?? fresh.length;
  }

  revalidatePath("/admin/students");
  return { error: null, summary: { inserted, rowErrors } };
}

export async function assignSpecialist(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const studentId = String(formData.get("studentId") ?? "");
  const specialistId = String(formData.get("specialistId") ?? "");
  if (!studentId || !specialistId) throw new Error("Student and specialist are required");

  // The person must be an active reading specialist in this school, so a
  // pasted id from another school can't be given access to this one's students.
  const { data: specialist } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", specialistId)
    .eq("school_id", profile.school_id)
    .eq("role", "reading_specialist")
    .eq("is_active", true)
    .maybeSingle();
  if (!specialist) throw new Error("That person is not a reading specialist at this school");

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
