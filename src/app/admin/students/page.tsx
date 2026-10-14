import { redirect } from "next/navigation";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { PageHeader } from "@/components/PageHeader";
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
import { LEVEL_OPTIONS, levelLabel } from "@/lib/levels";
import { STUDENTS_PER_PAGE, lastPage, likeContains, pageRange, parseStudentFilters, studentsHref } from "@/lib/studentFilters";
import { StudentFilters } from "./StudentFilters";

/** A query the name, level and teacher filters can be applied to (the count and the rows share them). */
interface Narrowable<T> {
  ilike(column: string, pattern: string): T;
  eq(column: string, value: string | number): T;
}

export default async function AdminStudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect(pathForUnauthorizedProfile(profile));

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("school_id", profile.school_id)
    .order("name");
  const teachers = (staff ?? []).filter((s) => s.role === "teacher");
  const specialists = (staff ?? []).filter((s) => s.role === "reading_specialist");

  const filters = parseStudentFilters(raw, teachers.map((t) => t.id));
  const { q, level, teacher } = filters;
  const filtered = q !== "" || level !== null || teacher !== null;

  // The same filters for the count and for the page of rows.
  const narrow = <T extends Narrowable<T>>(query: T): T => {
    let next = query;
    if (q) next = next.ilike("name", likeContains(q));
    if (level !== null) next = next.eq("level", level);
    if (teacher) next = next.eq("teacher_id", teacher);
    return next;
  };
  const { count } = await narrow(supabase.from("students").select("id", { count: "exact", head: true }));
  const total = count ?? 0;
  // A page past the end (after a delete, or a stale link) shows the last one.
  const page = Math.min(filters.page, lastPage(total));
  const [from, to] = pageRange(page);
  const { data: students } = await narrow(supabase.from("students").select("id, name, level, teacher_id").order("name")).range(from, to);

  const { data: assignments } = await supabase
    .from("specialist_assignments")
    .select("student_id, specialist_id");

  const deletedStudents = await listDeletedStudents();

  const specialistById = new Map((specialists ?? []).map((s) => [s.id, s.name]));
  const specialistIdsByStudent = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = specialistIdsByStudent.get(a.student_id) ?? [];
    list.push(a.specialist_id);
    specialistIdsByStudent.set(a.student_id, list);
  }

  return (
    <div className="w-full max-w-[920px]">
      <PageHeader
        title="Students"
        subtitle={
          total === 0
            ? filtered ? "No students match." : "No students yet."
            : total <= STUDENTS_PER_PAGE
              ? `${total} ${filtered ? "found" : "in your school"}`
              : `Showing ${from + 1}–${Math.min(to + 1, total)} of ${total}${filtered ? " found" : ""}`
        }
      />

      <StudentFilters teachers={teachers.map((t) => ({ id: t.id, name: t.name }))} initial={{ q, level, teacher }} />

      <details open={total === 0 && !filtered} className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-6 py-5 sm:px-8 mb-6">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-[var(--color-orange)] px-5 py-2.5 text-sm font-bold text-[var(--color-on-orange)] [&::-webkit-details-marker]:hidden">+ Add students</summary>
        <div className="mt-5">
          <AddStudentForm teachers={teachers} />
          <ImportCsvForm />
        </div>
      </details>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden">
        {(students ?? []).length === 0 && (
          <div className="px-6 py-8 text-[var(--color-muted)] text-center">{filtered ? "No students match." : "No students yet."}</div>
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
                  name="level"
                  aria-label="Level"
                  defaultValue={s.level}
                  className="border-2 border-[var(--color-neutral-border)] rounded-lg px-2 py-1 text-sm w-20"
                >
                  {LEVEL_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {levelLabel(l)}
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

      {total > STUDENTS_PER_PAGE && (
        <nav aria-label="Pages of students" className="flex items-center justify-between gap-3 mt-4">
          {page > 1 ? (
            <a href={studentsHref({ q, level, teacher, page: page - 1 })} className="font-bold text-sm text-[var(--color-orange-dark)] bg-[var(--color-neutral)] rounded-full px-4.5 py-2.5 no-underline">
              ← Previous
            </a>
          ) : (
            <span />
          )}
          <span className="text-sm text-[var(--color-muted)]">
            Page {page} of {lastPage(total)}
          </span>
          {page < lastPage(total) ? (
            <a href={studentsHref({ q, level, teacher, page: page + 1 })} className="font-bold text-sm text-[var(--color-orange-dark)] bg-[var(--color-neutral)] rounded-full px-4.5 py-2.5 no-underline">
              Next →
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}

      {deletedStudents.length > 0 && (
        <details className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden mt-6">
          <summary className="cursor-pointer font-heading font-bold text-sm text-[var(--color-ink)] px-6 py-5">
            Deleted students ({deletedStudents.length})
          </summary>
          {deletedStudents.map((s) => (
            <div
              key={s.id}
              className="px-6 py-4 border-t border-[var(--color-neutral-divider)] flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-extrabold text-[var(--color-ink)] text-base">{s.name}</div>
                <div className="text-[13px] text-[var(--color-muted-light)]">
                  {levelLabel(s.level)} · Deleted {new Date(s.deleted_at!).toLocaleDateString()}
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
        </details>
      )}
    </div>
  );
}
