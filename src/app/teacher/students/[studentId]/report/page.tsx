import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ROLE_AVATAR } from "@/lib/avatars";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeOverallLabel } from "@/lib/scoring";
import { FLAGGED_SCORE_THRESHOLD } from "@/lib/theme";
import { retryStudentReport } from "./actions";
import type { AssessmentItem } from "@/lib/database.types";

type ResultRow = { score: number; flagged_as_difficulty: boolean; skill_areas: { id: string; name: string } };
type HistorySessionRow = {
  id: string;
  completed_at: string | null;
  assessment_cycles: { name: string } | null;
  results: { score: number; flagged_as_difficulty: boolean }[];
};

function formatAnswer(item: AssessmentItem, answer: unknown): string {
  if (item.type === "mic") {
    if (typeof answer === "string" && answer && answer !== "attempted") return `"${answer}"`;
    return "Read aloud (attempted)";
  }
  return typeof answer === "string" ? answer : "N/A";
}

export default async function StudentReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { studentId } = await params;
  const { session: sessionIdParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, name, grade")
    .eq("id", studentId)
    .single();
  if (studentError || !student) notFound();

  let sessionId = sessionIdParam;
  if (!sessionId) {
    const { data: latest } = await supabase
      .from("assessment_sessions")
      .select("id")
      .eq("student_id", studentId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) redirect("/teacher");
    sessionId = latest.id;
  }

  const { data: session } = await supabase
    .from("assessment_sessions")
    .select("id, completed_at, assessment_id")
    .eq("id", sessionId)
    .single();
  if (!session) notFound();

  const { data: assessment } = await supabase
    .from("assessments")
    .select("items")
    .eq("id", session.assessment_id)
    .single();
  const items = (assessment?.items ?? []) as AssessmentItem[];

  const { data: responses } = await supabase
    .from("responses")
    .select("item_id, answer, is_correct")
    .eq("session_id", sessionId);
  const responseByItemId = new Map((responses ?? []).map((r) => [r.item_id, r]));

  const { data: results, error: resultsError } = await supabase
    .from("results")
    .select("score, flagged_as_difficulty, skill_areas(id, name)")
    .eq("session_id", sessionId);
  if (resultsError) notFound();
  const rows = (results ?? []) as unknown as ResultRow[];

  const flaggedIds = rows.filter((r) => r.flagged_as_difficulty).map((r) => r.skill_areas.id);
  const { data: recRows } = flaggedIds.length
    ? await supabase
        .from("recommendation_rules")
        .select("recommendation_text, skill_areas(name)")
        .in("skill_area_id", flaggedIds)
        .eq("grade_level", student.grade)
    : { data: [] };

  const { data: report } = await supabase
    .from("student_reports")
    .select("status, pdf_path")
    .eq("session_id", sessionId)
    .maybeSingle();

  const { data: historyRaw } = await supabase
    .from("assessment_sessions")
    .select("id, completed_at, assessment_cycles(name), results(score, flagged_as_difficulty)")
    .eq("student_id", studentId)
    .eq("status", "completed")
    .order("completed_at", { ascending: true });
  const history = ((historyRaw ?? []) as unknown as HistorySessionRow[]).map((s) => {
    const scores = s.results.map((r) => r.score);
    return {
      sessionId: s.id,
      cycleName: s.assessment_cycles?.name ?? "Unknown cycle",
      completedAt: s.completed_at
        ? new Date(s.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "N/A",
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      label: computeOverallLabel(s.results.filter((r) => r.flagged_as_difficulty).length),
    };
  });

  after(async () => {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user?.id ?? null,
      action: "report.view",
      resource_type: "student_report",
      resource_id: sessionId,
    });
  });

  const overallLabel = computeOverallLabel(flaggedIds.length);
  const isOnTrack = overallLabel === "On Track";
  const assessedDate = session.completed_at
    ? new Date(session.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "N/A";

  return (
    <AppShell avatarSrc={profile ? ROLE_AVATAR[profile.role] : undefined}>
      <div className="w-full max-w-[760px]">
        <Link href="/teacher" className="text-[var(--color-sage)] font-bold text-sm no-underline inline-block mb-4">
          &larr; Back to class
        </Link>

        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5">
          <div className="flex justify-between items-start flex-wrap gap-4 mb-5.5">
            <div>
              <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-sage-deep)] m-0 mb-1">
                {student.name}
              </h1>
              <p className="text-[var(--color-muted)] text-sm m-0">
                Grade {student.grade} · Assessed {assessedDate}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className="font-extrabold text-sm px-4 py-2 rounded-full"
                style={{
                  background: isOnTrack ? "var(--color-sage-tint)" : "var(--color-terracotta-tint)",
                  color: isOnTrack ? "var(--color-sage-dark)" : "var(--color-terracotta-dark)",
                }}
              >
                {overallLabel}
              </span>
              {report?.status === "ready" ? (
                <a
                  href={`/api/reports/student/${sessionId}`}
                  className="bg-[var(--color-neutral)] border-none text-[var(--color-sage-dark)] font-bold text-sm px-4 py-2.25 rounded-full no-underline transition-colors hover:bg-[var(--color-neutral-divider)]"
                >
                  Export PDF
                </a>
              ) : report?.status === "failed" ? (
                <form action={retryStudentReport}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <button
                    type="submit"
                    className="bg-[var(--color-terracotta-tint)] border-none text-[var(--color-terracotta-dark)] font-bold text-sm px-4 py-2.25 rounded-full cursor-pointer"
                  >
                    Retry PDF
                  </button>
                </form>
              ) : (
                <span className="bg-[var(--color-neutral)] border-none text-[var(--color-muted)] font-bold text-sm px-4 py-2.25 rounded-full">
                  PDF generating…
                </span>
              )}
            </div>
          </div>

          <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-3.5">
            Skill Area Breakdown
          </div>
          <div className="flex flex-col gap-3.5">
            {rows.map((sk) => {
              const flagged = sk.score < 65;
              return (
                <div key={sk.skill_areas.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-bold text-[var(--color-ink-soft)]">{sk.skill_areas.name}</span>
                    <span
                      className="font-bold"
                      style={{ color: flagged ? "var(--color-terracotta-dark)" : "var(--color-sage-dark)" }}
                    >
                      {sk.score}%
                    </span>
                  </div>
                  <div className="h-3 bg-[var(--color-neutral-divider)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${sk.score}%`,
                        background: flagged ? "var(--color-terracotta)" : "var(--color-sage)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {history.length > 1 && (
          <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5">
            <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-3.5">
              Progress Over Time
            </div>
            <div className="flex flex-col gap-3.5">
              {history.map((h) => {
                const flagged = h.avgScore < FLAGGED_SCORE_THRESHOLD;
                const isCurrent = h.sessionId === sessionId;
                return (
                  <div key={h.sessionId}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-bold text-[var(--color-ink-soft)]">
                        {h.cycleName} · {h.completedAt}
                        {isCurrent && (
                          <span className="ml-2 text-[11px] font-extrabold text-[var(--color-sage-dark)] bg-[var(--color-sage-tint)] px-2 py-0.5 rounded-full align-middle">
                            Viewing
                          </span>
                        )}
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: flagged ? "var(--color-terracotta-dark)" : "var(--color-sage-dark)" }}
                      >
                        {h.avgScore}% · {h.label}
                      </span>
                    </div>
                    <div className="h-3 bg-[var(--color-neutral-divider)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${h.avgScore}%`,
                          background: flagged ? "var(--color-terracotta)" : "var(--color-sage)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5">
          <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4">
            Question-by-Question
          </div>
          <div className="flex flex-col gap-3">
            {items.map((item, i) => {
              const response = responseByItemId.get(item.id);
              const isCorrect = response?.is_correct === true;
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3.5 bg-[var(--color-neutral)] rounded-xl px-4.5 py-3.5"
                >
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold text-white mt-0.5"
                    style={{ background: isCorrect ? "var(--color-sage)" : "var(--color-terracotta)" }}
                  >
                    {isCorrect ? "✓" : "✕"}
                  </span>
                  <div>
                    <div className="text-[var(--color-muted)] text-xs font-bold uppercase mb-0.5">
                      Question {i + 1}
                    </div>
                    <div className="text-[var(--color-ink-soft)] text-sm mb-1">{item.prompt}</div>
                    <div className="text-[var(--color-body)] text-sm">
                      Answer: {response ? formatAnswer(item, response.answer) : "Not answered"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5">
          <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4">
            Program-Aligned Recommendations
          </div>
          <div className="flex flex-col gap-3.5">
            {(recRows ?? []).length === 0 ? (
              <p className="text-[var(--color-body)] text-sm m-0">
                No flagged areas this cycle. Continue with grade-level independent reading.
              </p>
            ) : (
              (recRows ?? []).map((rec, i) => (
                <div
                  key={i}
                  className="flex gap-3.5 bg-[var(--color-terracotta-tint)] border-l-4 border-[var(--color-terracotta)] rounded-[10px] px-4.5 py-3.5"
                >
                  <div className="flex-1">
                    {/* @ts-expect-error -- joined relation shape isn't modeled in database.types.ts */}
                    <div className="font-extrabold text-[var(--color-sage-deep)] text-sm mb-1">{rec.skill_areas?.name}</div>
                    <div className="text-[var(--color-body)] text-sm leading-relaxed">{rec.recommendation_text}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
