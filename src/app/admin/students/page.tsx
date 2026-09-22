import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addStudent, assignSpecialist, unassignSpecialist } from "./actions";

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

  const teacherById = new Map((teachers ?? []).map((t) => [t.id, t.name]));
  const specialistById = new Map((specialists ?? []).map((s) => [s.id, s.name]));
  const specialistIdsByStudent = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = specialistIdsByStudent.get(a.student_id) ?? [];
    list.push(a.specialist_id);
    specialistIdsByStudent.set(a.student_id, list);
  }

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[26px] text-[var(--color-sage-deep)] m-0 mb-6">Students</h1>

      <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] px-8 py-7.5 mb-6">
        <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4">Add a student</div>
        <form action={addStudent} className="flex flex-wrap items-end gap-3.5">
          <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[180px]">
            <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Name</span>
            <input
              name="name"
              required
              className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm w-24">
            <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Grade</span>
            <input
              name="grade"
              type="number"
              defaultValue={1}
              min={1}
              max={12}
              required
              className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[180px]">
            <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Teacher</span>
            <select
              name="teacherId"
              required
              className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5"
            >
              {teachers.length === 0 && <option value="">No teachers yet</option>}
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={teachers.length === 0}
            className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm px-5 py-2.75 cursor-pointer disabled:opacity-50"
          >
            Add student
          </button>
        </form>
        {teachers.length === 0 && (
          <p className="text-[var(--color-muted)] text-sm mt-3 mb-0">
            Add a teacher on the Staff tab first — students need one assigned.
          </p>
        )}
      </div>

      <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] overflow-hidden">
        {(students ?? []).length === 0 && (
          <div className="px-6 py-8 text-[var(--color-muted)] text-center">No students yet.</div>
        )}
        {(students ?? []).map((s) => {
          const assignedIds = specialistIdsByStudent.get(s.id) ?? [];
          const availableSpecialists = specialists.filter((sp) => !assignedIds.includes(sp.id));
          return (
            <div
              key={s.id}
              className="px-6 py-4.5 border-b border-[var(--color-cream-divider)] last:border-b-0 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <div className="font-extrabold text-[var(--color-sage-deep)] text-base">{s.name}</div>
                <div className="text-[13px] text-[var(--color-muted-light)]">
                  Grade {s.grade} · Teacher: {teacherById.get(s.teacher_id) ?? "—"}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {assignedIds.map((specId) => (
                  <form action={unassignSpecialist} key={specId} className="flex items-center gap-1.5">
                    <input type="hidden" name="studentId" value={s.id} />
                    <input type="hidden" name="specialistId" value={specId} />
                    <span className="bg-[var(--color-gold-bg)] text-[var(--color-gold-text)] text-xs font-bold px-3 py-1.5 rounded-full">
                      {specialistById.get(specId) ?? "Specialist"}
                    </span>
                    <button
                      type="submit"
                      className="text-[var(--color-terracotta-dark)] text-xs font-bold bg-none border-none cursor-pointer"
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
                      className="border-2 border-[var(--color-cream-border)] rounded-full px-3 py-1.5 text-xs"
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
                      className="bg-white border-[1.5px] border-[var(--color-cream-border-strong)] text-[var(--color-sage-dark)] font-bold text-xs px-3 py-1.5 rounded-full cursor-pointer"
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
    </div>
  );
}
