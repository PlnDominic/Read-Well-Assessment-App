import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { ROLE_AVATAR } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/server";
import { cancelSession, startOrResumeAssessment } from "./actions";
import { AddStudentForm } from "./AddStudentForm";

const STATUS_STYLE: Record<
  string,
  { label: string; bg: string; color: string; actionBg: string; actionColor: string; actionBorder: string; actionLabel: string }
> = {
  // Solid black/white rather than the orange used everywhere else: orange
  // is reserved for "needs attention" states (in progress, not started),
  // so a finished assessment reads as the neutral, no-action-needed one.
  completed: {
    label: "Completed",
    bg: "var(--color-ink)",
    color: "var(--color-surface)",
    actionBg: "var(--color-surface)",
    actionColor: "var(--color-ink)",
    actionBorder: "var(--color-ink)",
    actionLabel: "View Report",
  },
  in_progress: {
    label: "In Progress",
    bg: "var(--color-orange-tint)",
    color: "var(--color-orange-dark)",
    actionBg: "var(--color-surface)",
    actionColor: "var(--color-orange-dark)",
    actionBorder: "var(--color-orange-tint-border)",
    actionLabel: "Resume",
  },
  not_started: {
    label: "Not Started",
    bg: "var(--color-neutral)",
    color: "var(--color-muted)",
    actionBg: "var(--color-orange)",
    actionColor: "white",
    actionBorder: "var(--color-orange)",
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
        .select("id, student_id, status, session_code, created_at")
        .in("student_id", studentIds)
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const latestSessionByStudent = new Map<string, { id: string; status: string; sessionCode: string }>();
  for (const s of sessions ?? []) {
    if (!latestSessionByStudent.has(s.student_id)) {
      latestSessionByStudent.set(s.student_id, { id: s.id, status: s.status, sessionCode: s.session_code });
    }
  }

  return (
    <AppShell avatarSrc={ROLE_AVATAR[profile.role]}>
      <div className="w-full max-w-[840px]">
        <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-ink)] m-0 mb-1">
          {profile.role === "reading_specialist" ? "Assigned Students" : `${profile.name}'s Class`}
        </h1>
        <p className="text-[var(--color-muted)] text-[15px] m-0 mb-6">
          Grade 1 · {cycle?.name ?? "No active assessment cycle"}
        </p>

        {profile.role === "teacher" && (
          <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-6 py-5 mb-5">
            <AddStudentForm />
          </div>
        )}

        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden">
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
                className="flex items-center justify-between gap-3.5 px-6 py-4.5 border-b border-[var(--color-neutral-divider)] flex-wrap last:border-b-0"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10.5 h-10.5 rounded-full bg-[var(--color-orange-tint)] flex items-center justify-center font-heading font-bold text-[var(--color-orange-dark)]">
                    {initials}
                  </div>
                  <div>
                    <div className="font-extrabold text-[var(--color-ink)] text-base">{s.name}</div>
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
                  {status !== "completed" && latest && (
                    <span
                      className="text-xs font-bold text-[var(--color-muted)]"
                      title="Enter this at /student/join on the student's device"
                    >
                      Code: <code className="bg-[var(--color-neutral)] px-2 py-1 rounded font-bold">{latest.sessionCode}</code>
                    </span>
                  )}
                  {status === "completed" && latest ? (
                    <>
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
                      <form action={startOrResumeAssessment.bind(null, s.id)}>
                        <button
                          type="submit"
                          className="font-bold text-sm px-4.5 py-2.25 rounded-full cursor-pointer bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] transition-colors hover:bg-[var(--color-neutral-divider)]"
                        >
                          Start New Assessment
                        </button>
                      </form>
                    </>
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
                            className="text-[var(--color-orange-dark)] text-xs font-bold bg-none border-none cursor-pointer"
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
