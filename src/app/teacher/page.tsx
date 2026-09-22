import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { createClient } from "@/lib/supabase/server";
import { addStudentToOwnRoster, cancelSession, startOrResumeAssessment } from "./actions";

const STATUS_STYLE: Record<
  string,
  { label: string; bg: string; color: string; actionBg: string; actionColor: string; actionBorder: string; actionLabel: string }
> = {
  completed: {
    label: "Completed",
    bg: "var(--color-sage-tint)",
    color: "var(--color-sage-dark)",
    actionBg: "white",
    actionColor: "var(--color-sage-dark)",
    actionBorder: "var(--color-sage-tint-border)",
    actionLabel: "View Report",
  },
  in_progress: {
    label: "In Progress",
    bg: "var(--color-gold-bg)",
    color: "var(--color-gold-text)",
    actionBg: "white",
    actionColor: "var(--color-gold-text)",
    actionBorder: "var(--color-gold-border)",
    actionLabel: "Resume",
  },
  not_started: {
    label: "Not Started",
    bg: "#F1EEE4",
    color: "#8A8A78",
    actionBg: "var(--color-sage)",
    actionColor: "white",
    actionBorder: "var(--color-sage)",
    actionLabel: "Start Assessment",
  },
};

export default async function TeacherRosterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("name, school_id, role").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const { data: students } = await supabase
    .from("students")
    .select("id, name, grade")
    .order("name");

  const { data: cycle } = await supabase
    .from("assessment_cycles")
    .select("id, name")
    .eq("school_id", profile.school_id)
    .eq("is_current", true)
    .maybeSingle();

  const studentIds = (students ?? []).map((s) => s.id);
  const { data: sessions } = cycle && studentIds.length > 0
    ? await supabase
        .from("assessment_sessions")
        .select("id, student_id, status, created_at")
        .in("student_id", studentIds)
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const latestSessionByStudent = new Map<string, { id: string; status: string }>();
  for (const s of sessions ?? []) {
    if (!latestSessionByStudent.has(s.student_id)) {
      latestSessionByStudent.set(s.student_id, { id: s.id, status: s.status });
    }
  }

  return (
    <AppShell>
      <div className="w-full max-w-[840px]">
        <h1 className="font-heading font-bold text-[26px] text-[var(--color-sage-deep)] m-0 mb-1">
          {profile.role === "reading_specialist" ? "Assigned Students" : `${profile.name}'s Class`}
        </h1>
        <p className="text-[var(--color-muted)] text-[15px] m-0 mb-6">
          Grade 1 · {cycle?.name ?? "No active assessment cycle"}
        </p>

        {profile.role === "teacher" && (
          <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] px-6 py-5 mb-5">
            <form action={addStudentToOwnRoster} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[160px]">
                <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Add a student</span>
                <input
                  name="name"
                  placeholder="Student name"
                  required
                  className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5"
                />
              </label>
              <select
                name="grade"
                defaultValue={1}
                className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm px-4.5 py-2.5 cursor-pointer"
              >
                Add
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] overflow-hidden">
          {(students ?? []).length === 0 && (
            <div className="px-6 py-8 text-[var(--color-muted)] text-center">No students yet.</div>
          )}
          {(students ?? []).map((s) => {
            const latest = latestSessionByStudent.get(s.id);
            const status = latest?.status ?? "not_started";
            const style = STATUS_STYLE[status];
            const initials = s.name
              .split(" ")
              .map((n) => n[0])
              .join("");

            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3.5 px-6 py-4.5 border-b border-[var(--color-cream-divider)] flex-wrap last:border-b-0"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10.5 h-10.5 rounded-full bg-[var(--color-sage-tint)] flex items-center justify-center font-heading font-bold text-[var(--color-sage-dark)]">
                    {initials}
                  </div>
                  <div>
                    <div className="font-extrabold text-[var(--color-sage-deep)] text-base">{s.name}</div>
                    <div className="text-[13px] text-[var(--color-muted-light)]">Grade {s.grade}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <span
                    className="font-bold text-[13px] px-3.5 py-1.5 rounded-full"
                    style={{ background: style.bg, color: style.color }}
                  >
                    {style.label}
                  </span>
                  {status === "completed" && latest ? (
                    <Link
                      href={`/teacher/students/${s.id}/report?session=${latest.id}`}
                      className="font-bold text-sm px-4.5 py-2.25 rounded-full no-underline"
                      style={{
                        background: style.actionBg,
                        color: style.actionColor,
                        border: `1.5px solid ${style.actionBorder}`,
                      }}
                    >
                      {style.actionLabel}
                    </Link>
                  ) : (
                    <>
                      <form action={startOrResumeAssessment.bind(null, s.id)}>
                        <button
                          type="submit"
                          className="font-bold text-sm px-4.5 py-2.25 rounded-full cursor-pointer"
                          style={{
                            background: style.actionBg,
                            color: style.actionColor,
                            border: `1.5px solid ${style.actionBorder}`,
                          }}
                        >
                          {style.actionLabel}
                        </button>
                      </form>
                      {profile.role === "teacher" && latest && (
                        <form action={cancelSession}>
                          <input type="hidden" name="sessionId" value={latest.id} />
                          <ConfirmSubmitButton
                            confirmMessage={`Cancel ${s.name}'s in-progress session? They'll need a new code to start over.`}
                            className="text-[var(--color-terracotta-dark)] text-xs font-bold bg-none border-none cursor-pointer"
                          >
                            Cancel
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
