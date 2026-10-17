import { PrepareOffline } from "@/components/PrepareOffline";
import { redirect } from "next/navigation";
import { NO_PROFILE_LOGIN } from "@/lib/staffRouting";
import Link from "next/link";
import { StaffShell } from "@/components/StaffShell";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { createClient } from "@/lib/supabase/server";
import { formDeliveryLabel, formLabel, levelLabel, type AssessmentForm, type Delivery } from "@/lib/levels";
import { aiConfigured } from "@/lib/aiSummaryServer";
import { parseCycleSummary } from "@/lib/cycleSummary";
import { CycleSummaryView } from "@/components/CycleSummaryView";
import { cancelSession } from "./actions";
import { AddStudentForm } from "./AddStudentForm";
import { DraftClassSummaries } from "./DraftClassSummaries";
import { StartAssessmentMenu } from "./StartAssessmentMenu";

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  // Solid black/white rather than the orange used everywhere else: orange
  // is reserved for "needs attention" states (in progress, not started),
  // so a finished assessment reads as the neutral, no-action-needed one.
  completed: { label: "Completed", bg: "var(--color-ink)", color: "var(--color-surface)" },
  in_progress: { label: "In Progress", bg: "var(--color-orange-tint)", color: "var(--color-orange-dark)" },
  not_started: { label: "Not Started", bg: "var(--color-neutral)", color: "var(--color-muted)" },
};

type SessionRow = {
  id: string;
  student_id: string;
  status: string;
  session_code: string | null;
  created_at: string;
  assessments: { form: AssessmentForm | null; delivery: Delivery } | null;
};

export default async function TeacherRosterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("name, school_id, role").eq("id", user.id).single();
  if (!profile) redirect(NO_PROFILE_LOGIN);
  // Reading specialists see this list read-only; only teachers and
  // administrators give assessments (assessment_sessions_insert_staff, 0004).
  const canAssess = profile.role === "teacher" || profile.role === "administrator";

  const { data: students } = await supabase
    .from("students")
    .select("id, name, level")
    .order("name");

  const { data: cycle } = await supabase
    .from("assessment_cycles")
    .select("id, name")
    .eq("school_id", profile.school_id)
    .eq("is_current", true)
    .maybeSingle();

  const studentIds = (students ?? []).map((s) => s.id);
  const { data: sessionsRaw } = cycle && studentIds.length > 0
    ? await supabase
        .from("assessment_sessions")
        .select("id, student_id, status, session_code, created_at, assessments(form, delivery)")
        .in("student_id", studentIds)
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: false })
    : { data: [] };
  const sessions = (sessionsRaw ?? []) as unknown as SessionRow[];

  // Which of A, B, C and the Final assessment have been added for each
  // level, and which ways (game, given by an adult): a teacher can only
  // pick one that exists.
  const { data: activeForms } = await supabase
    .from("assessments")
    .select("level, form, delivery")
    .eq("is_active", true)
    .not("form", "is", null);
  const formsByLevel = new Map<number, { form: AssessmentForm; delivery: Delivery }[]>();
  for (const a of activeForms ?? []) {
    const list = formsByLevel.get(a.level) ?? [];
    list.push({ form: a.form as AssessmentForm, delivery: a.delivery });
    formsByLevel.set(a.level, list);
  }

  // The latest session per student in this cycle. A kiosk session from
  // before levels (form null) that was never finished can't be resumed, so
  // it's passed over; a finished one still links to its report.
  // A game form is played by the child on their own device: its session has
  // a code to type at /student/join, or the teacher hands over this device.
  type LatestSession = { id: string; status: string; form: AssessmentForm | null; delivery: Delivery; game: boolean; sessionCode: string | null };
  const latestSessionByStudent = new Map<string, LatestSession>();
  for (const s of sessions) {
    const form = s.assessments?.form ?? null;
    if (form === null && s.status !== "completed") continue;
    if (!latestSessionByStudent.has(s.student_id)) {
      const delivery = s.assessments?.delivery ?? "assessor";
      latestSessionByStudent.set(s.student_id, { id: s.id, status: s.status, form, delivery, game: delivery === "game", sessionCode: s.session_code });
    }
  }
  const hasCompletedReport = [...latestSessionByStudent.values()].some((s) => s.status === "completed");

  // AI summaries (0022, 0023): which finished assessments have one waiting
  // to be checked, and which have none yet, for drafting the class at once.
  const { data: school } = await supabase.from("schools").select("ai_reports_enabled").eq("id", profile.school_id).maybeSingle();
  const canDraft = canAssess && Boolean(school?.ai_reports_enabled) && aiConfigured();
  const completedSessionIds = [...latestSessionByStudent.values()].filter((s) => s.status === "completed").map((s) => s.id);
  const { data: summaryRows } = completedSessionIds.length
    ? await supabase.from("student_report_summaries").select("session_id, status").in("session_id", completedSessionIds)
    : { data: [] };
  const summaryStatus = new Map((summaryRows ?? []).map((r) => [r.session_id, r.status]));
  const withoutSummary = (students ?? []).flatMap((s) => {
    const latest = latestSessionByStudent.get(s.id);
    return latest?.status === "completed" && !summaryStatus.has(latest.id) ? [{ sessionId: latest.id, name: s.name }] : [];
  });

  // The class's summary for this cycle, once an administrator has approved it.
  const { data: classSummaryRow } =
    cycle && profile.role === "teacher"
      ? await supabase
          .from("cycle_report_summaries")
          .select("content")
          .eq("cycle_id", cycle.id)
          .eq("teacher_id", user.id)
          .eq("status", "approved")
          .maybeSingle()
      : { data: null };
  const classSummary = classSummaryRow ? parseCycleSummary(classSummaryRow.content) : null;

  const classLevels = [...new Set((students ?? []).map((s) => s.level))].sort((a, b) => a - b);

  return (
    <StaffShell role={profile.role}>
      <div className="w-full max-w-[840px]">
        <div className="flex justify-between items-start flex-wrap gap-3.5 mb-1">
          <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-ink)] m-0">
            {profile.role === "reading_specialist" ? "Assigned Students" : `${profile.name}'s Class`}
          </h1>
          {hasCompletedReport && (
            <a
              href="/api/reports/class"
              className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] font-bold text-sm px-4.5 py-2.5 rounded-full no-underline transition-colors hover:bg-[var(--color-neutral-divider)]"
            >
              Export all reports (PDF)
            </a>
          )}
        </div>
        <p className="text-[var(--color-muted)] text-[15px] m-0 mb-6">
          {classLevels.map(levelLabel).concat(cycle?.name ?? "No active assessment cycle").join(" · ")}
        </p>

        {classSummary && (
          <section
            aria-labelledby="class-summary-heading"
            className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-6 py-5 mb-5"
          >
            <h2 id="class-summary-heading" className="font-heading font-bold text-sm text-[var(--color-ink)] m-0 mb-3">
              Your class this cycle
            </h2>
            <CycleSummaryView content={classSummary} />
            <p className="text-xs text-[var(--color-muted)] m-0">Drafted with AI from the class&apos;s totals and approved by an administrator.</p>
          </section>
        )}

        {profile.role === "teacher" && (
          <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-6 py-5 mb-5">
            <AddStudentForm />
          </div>
        )}

        {canDraft && hasCompletedReport && <DraftClassSummaries sessions={withoutSummary} />}

        {canAssess && (
          <PrepareOffline
            sessions={(students ?? []).flatMap((s) => {
              const latest = latestSessionByStudent.get(s.id);
              return latest && latest.status !== "completed" ? [{ id: latest.id, game: latest.game }] : [];
            })}
          />
        )}

        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)]">
          {(students ?? []).length === 0 && (
            <div className="px-6 py-8 text-[var(--color-muted)] text-center">No students yet.</div>
          )}
          {(students ?? []).map((s) => {
            const latest = latestSessionByStudent.get(s.id);
            const status = latest?.status ?? "not_started";
            const style = STATUS_STYLE[status];
            const unfinished = latest && status !== "completed";
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
                    <div className="text-[13px] text-[var(--color-muted-light)]">{levelLabel(s.level)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="font-bold text-[13px] px-3.5 py-1.5 rounded-full"
                    style={{ background: style.bg, color: style.color }}
                  >
                    {latest ? style.label : "Not assessed yet"}
                    {latest?.form ? ` · ${formDeliveryLabel(latest.form, latest.delivery)}` : ""}
                  </span>
                  {unfinished && latest.game && latest.sessionCode && (
                    <span
                      className="text-xs font-bold text-[var(--color-muted)]"
                      title="Enter this at /student/join on the student's device"
                    >
                      Code: <code className="bg-[var(--color-neutral)] px-2 py-1 rounded font-bold">{latest.sessionCode}</code>
                    </span>
                  )}
                  {status === "completed" && latest && summaryStatus.get(latest.id) === "draft" && canAssess && (
                    <span className="text-xs font-bold text-[var(--color-orange-dark)]">Summary to check</span>
                  )}
                  {status === "completed" && latest && (
                    <Link
                      href={`/teacher/students/${s.id}/report?session=${latest.id}`}
                      className="font-bold text-sm px-4.5 py-2.25 rounded-full no-underline bg-[var(--color-surface)] text-[var(--color-ink)] border-[1.5px] border-[var(--color-ink)]"
                    >
                      View Report
                    </Link>
                  )}
                  {canAssess && unfinished && (
                    <>
                      <Link
                        href={latest.game ? `/student/session/${latest.id}` : `/teacher/assess/${latest.id}`}
                        title={latest.game ? "Opens the game on this device for the student to play" : undefined}
                        className="font-bold text-sm px-4.5 py-2.25 rounded-full no-underline bg-[var(--color-orange)] text-[var(--color-on-orange)]"
                      >
                        {latest.game ? "Play here" : status === "in_progress" ? "Resume" : "Open"}
                      </Link>
                      <form action={cancelSession}>
                        <input type="hidden" name="sessionId" value={latest.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Cancel ${s.name}'s unfinished ${latest.form ? formLabel(latest.form) : "assessment"}? The answers given so far are deleted.`}
                          className="text-[var(--color-orange-dark)] text-xs font-bold bg-none border-none cursor-pointer"
                        >
                          Cancel
                        </ConfirmSubmitButton>
                      </form>
                    </>
                  )}
                  {canAssess && !unfinished && (
                    <StartAssessmentMenu
                      studentId={s.id}
                      studentName={s.name}
                      level={s.level}
                      available={formsByLevel.get(s.level) ?? []}
                      label={status === "completed" ? "Start another" : "Start assessment"}
                      primary={status !== "completed"}
                      hasCycle={!!cycle}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </StaffShell>
  );
}
