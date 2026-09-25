import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  assignSpecialist,
  deleteStudent,
  listDeletedStudents,
  restoreStudent,
  unassignSpecialist,
  updateStudent,
} from "./actions";
import { AddStudentForm } from "./AddStudentForm";
import { ImportCsvForm } from "./ImportCsvForm";

export default async function AdminStudentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect("/");

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("school_id", profile.school_id)
    .order("name");
  const teachers = (staff ?? []).filter((s) => s.role === "teacher");
  const specialists = (staff ?? []).filter((s) => s.role === "reading_specialist");

  const { data: students } = await supabase
    .from("students")
    .select("id, name, grade, teacher_id")
    .order("name");

  const { data: assignments } = await supabase
    .from("specialist_assignments")
    .select("student_id, specialist_id");

  const deletedStudents = await listDeletedStudents(profile.school_id);

  const specialistById = new Map((specialists ?? []).map((s) => [s.id, s.name]));
  const specialistIdsByStudent = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = specialistIdsByStudent.get(a.student_id) ?? [];
    list.push(a.specialist_id);
    specialistIdsByStudent.set(a.student_id, list);
  }

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-ink)] m-0 mb-6">Students</h1>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-6">
        <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-4">Add a student</div>
        <AddStudentForm teachers={teachers} />
        <ImportCsvForm />
      </div>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden">
        {(students ?? []).length === 0 && (
          <div className="px-6 py-8 text-[var(--color-muted)] text-center">No students yet.</div>
        )}
        {(students ?? []).map((s) => {
          const assignedIds = specialistIdsByStudent.get(s.id) ?? [];
          const availableSpecialists = specialists.filter((sp) => !assignedIds.includes(sp.id));
          return (
            <div
              key={s.id}
              className="px-6 py-4.5 border-b border-[var(--color-neutral-divider)] last:border-b-0 flex flex-col gap-3"
            >
              <form action={updateStudent} className="flex flex-wrap items-end gap-2.5">
                <input type="hidden" name="id" value={s.id} />
                <input
                  name="name"
                  aria-label="Student name"
                  defaultValue={s.name}
                  required
                  className="font-extrabold text-[var(--color-ink)] text-base border-2 border-transparent hover:border-[var(--color-neutral-border)] focus:border-[var(--color-orange)] rounded-lg px-2 py-1 flex-1 min-w-[140px]"
                />
                <select
                  name="grade"
                  aria-label="Grade"
                  defaultValue={s.grade}
                  className="border-2 border-[var(--color-neutral-border)] rounded-lg px-2 py-1 text-sm w-20"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
                <select
                  name="teacherId"
                  aria-label="Teacher"
                  defaultValue={s.teacher_id}
                  className="border-2 border-[var(--color-neutral-border)] rounded-lg px-2 py-1 text-sm"
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] transition-colors hover:bg-[var(--color-neutral-divider)] font-bold text-xs px-3 py-1.5 rounded-full cursor-pointer"
                >
                  Save
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <form action={deleteStudent}>
                  <input type="hidden" name="id" value={s.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`Delete ${s.name}? They'll be removed from rosters and reports, but you can restore them from Deleted students below.`}
                    className="text-[var(--color-orange-dark)] text-xs font-bold bg-none border-none cursor-pointer"
                  >
                    Delete student
                  </ConfirmSubmitButton>
                </form>
                {assignedIds.map((specId) => (
                  <form action={unassignSpecialist} key={specId} className="flex items-center gap-1.5">
                    <input type="hidden" name="studentId" value={s.id} />
                    <input type="hidden" name="specialistId" value={specId} />
                    <span className="bg-[var(--color-orange-tint)] text-[var(--color-orange-dark)] text-xs font-bold px-3 py-1.5 rounded-full">
                      {specialistById.get(specId) ?? "Specialist"}
                    </span>
                    <button
                      type="submit"
                      className="text-[var(--color-orange-dark)] text-xs font-bold bg-none border-none cursor-pointer"
                    >
                      Remove
                    </button>
                  </form>
                ))}
                {availableSpecialists.length > 0 && (
                  <form action={assignSpecialist} className="flex items-center gap-1.5">
                    <input type="hidden" name="studentId" value={s.id} />
                    <select
                      name="specialistId"
                      aria-label="Assign specialist"
                      className="border-2 border-[var(--color-neutral-border)] rounded-full px-3 py-1.5 text-xs"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Assign specialist…
                      </option>
                      {availableSpecialists.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] transition-colors hover:bg-[var(--color-neutral-divider)] font-bold text-xs px-3 py-1.5 rounded-full cursor-pointer"
                    >
                      Assign
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {deletedStudents.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden mt-6">
          <div className="font-heading font-bold text-sm text-[var(--color-ink)] px-6 pt-6">Deleted students</div>
          <p className="text-[var(--color-muted)] text-sm px-6 mt-1 mb-4">
            Restoring puts a student back on their teacher&apos;s roster with their assessment history intact.
          </p>
          {deletedStudents.map((s) => (
            <div
              key={s.id}
              className="px-6 py-4 border-t border-[var(--color-neutral-divider)] flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-extrabold text-[var(--color-ink)] text-base">{s.name}</div>
                <div className="text-[13px] text-[var(--color-muted-light)]">
                  Grade {s.grade} · Deleted {new Date(s.deleted_at!).toLocaleDateString()}
                </div>
              </div>
              <form action={restoreStudent}>
                <input type="hidden" name="id" value={s.id} />
                <button
                  type="submit"
                  className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] transition-colors hover:bg-[var(--color-neutral-divider)] font-bold text-xs px-3.5 py-1.5 rounded-full cursor-pointer"
                >
                  Restore
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
