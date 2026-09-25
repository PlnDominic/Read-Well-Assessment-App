import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ROLE_AVATAR } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/server";

// completed is solid black/white rather than the orange used everywhere
// else: orange is reserved for "needs attention" states, so a finished
// assessment reads as the neutral, no-action-needed one.
const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  completed: { label: "Completed", bg: "var(--color-ink)", color: "var(--color-surface)" },
  in_progress: { label: "In Progress", bg: "var(--color-gold-bg)", color: "var(--color-gold-text)" },
  not_started: { label: "Not Started", bg: "var(--color-neutral)", color: "var(--color-muted)" },
};

export default async function SpecialistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("name, school_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "reading_specialist") redirect("/");

  // RLS (can_access_student) already scopes this to the specialist's
  // assigned students; no need to join specialist_assignments explicitly.
  const { data: students } = await supabase.from("students").select("id, name, grade").order("name");

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

  const latestByStudent = new Map<string, { id: string; status: string }>();
  for (const s of sessions ?? []) {
    if (!latestByStudent.has(s.student_id)) latestByStudent.set(s.student_id, { id: s.id, status: s.status });
  }

  return (
    <AppShell avatarSrc={ROLE_AVATAR[profile.role]}>
      <div className="w-full max-w-[840px]">
        <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-sage-deep)] m-0 mb-1">
          Assigned Students
        </h1>
        <p className="text-[var(--color-muted)] text-[15px] m-0 mb-6">{cycle?.name ?? "No active assessment cycle"}</p>

        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden">
          {(students ?? []).length === 0 && (
            <div className="px-6 py-8 text-[var(--color-muted)] text-center">
              No students assigned to you yet. Ask an administrator to assign one from the Students admin page.
            </div>
          )}
          {(students ?? []).map((s) => {
            const latest = latestByStudent.get(s.id);
            const status = latest?.status ?? "not_started";
            const style = STATUS_STYLE[status];
            const initials = s.name.split(" ").map((n) => n[0]).join("");

            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3.5 px-6 py-4.5 border-b border-[var(--color-neutral-divider)] flex-wrap last:border-b-0"
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
                  {status === "completed" && latest && (
                    <Link
                      href={`/teacher/students/${s.id}/report?session=${latest.id}`}
                      className="font-bold text-sm px-4.5 py-2.25 rounded-full no-underline bg-[var(--color-surface)] border-[1.5px] border-[var(--color-ink)] text-[var(--color-ink)]"
                    >
                      View Report
                    </Link>
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
