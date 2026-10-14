import { redirect } from "next/navigation";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aggregateClassroomBreakdown, computeWeightedAverage } from "@/lib/scoring";
import { retrySchoolReport } from "./actions";
import { levelLabel } from "@/lib/levels";
import { PageHeader, quietButton } from "@/components/PageHeader";

type ResultRow = {
  session_id: string;
  score: number;
  flagged_as_difficulty: boolean;
  skill_areas: { id: string; name: string };
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect(pathForUnauthorizedProfile(profile));

  const { data: school } = await supabase.from("schools").select("name").eq("id", profile.school_id).single();
  const { data: cycle } = await supabase
    .from("assessment_cycles")
    .select("id, name")
    .eq("school_id", profile.school_id)
    .eq("is_current", true)
    .maybeSingle();

  const { count: studentsTotal } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true });

  let studentsAssessed = 0;
  let level = 1;
  let avgOverallScore = 0;
  let skillDistribution: { name: string; pct: number }[] = [];
  let classroomBreakdown: ReturnType<typeof aggregateClassroomBreakdown> = [];
  let reportStatus: string | null = null;
  let reportLastError: string | null = null;

  if (cycle) {
    const { data: sessions } = await supabase
      .from("assessment_sessions")
      .select("id, student_id, students(level, teacher_id, profiles(name))")
      .eq("cycle_id", cycle.id)
      .eq("status", "completed");

    type SessionRow = {
      id: string;
      student_id: string;
      students: { level: number; teacher_id: string; profiles: { name: string } | null } | null;
    };
    const sessionRows = (sessions ?? []) as unknown as SessionRow[];

    const sessionIds = sessionRows.map((s) => s.id);
    studentsAssessed = new Set(sessionRows.map((s) => s.student_id)).size;
    level = sessionRows[0]?.students?.level ?? 1;
    // students/profiles are typed above as possibly null defensively: an
    // embedded to-one relation PostgREST can't resolve (RLS, or a student
    // whose teacher account was since removed) comes back null rather
    // than throwing, and previously this crashed the whole page (a
    // top-level-request render failure in the App Router looks like a
    // blank page in production, with no on-screen error). Sessions that
    // can't be attributed to a teacher just don't contribute to the
    // classroom breakdown below rather than taking the page down.
    const teacherBySessionId = new Map(
      sessionRows
        .filter((s) => s.students?.profiles)
        .map((s) => [s.id, { teacherId: s.students!.teacher_id, teacherName: s.students!.profiles!.name }])
    );

    if (sessionIds.length > 0) {
      const { data: results } = await supabase
        .from("results")
        .select("session_id, score, flagged_as_difficulty, skill_areas(id, name)")
        .in("session_id", sessionIds);
      const rows = (results ?? []) as unknown as ResultRow[];

      const { data: weightRows } = await supabase
        .from("school_skill_weights")
        .select("skill_area_id, weight")
        .eq("school_id", profile.school_id);
      const weightBySkillAreaId = new Map((weightRows ?? []).map((w) => [w.skill_area_id, w.weight]));

      avgOverallScore = computeWeightedAverage(
        rows.map((r) => ({ score: r.score, skillAreaId: r.skill_areas.id })),
        weightBySkillAreaId
      );

      const bySkill = new Map<string, { name: string; flagged: number; total: number }>();
      for (const r of rows) {
        const bucket = bySkill.get(r.skill_areas.id) ?? { name: r.skill_areas.name, flagged: 0, total: 0 };
        bucket.total += 1;
        if (r.flagged_as_difficulty) bucket.flagged += 1;
        bySkill.set(r.skill_areas.id, bucket);
      }
      skillDistribution = [...bySkill.values()]
        .map((b) => ({ name: b.name, pct: b.total ? Math.round((b.flagged / b.total) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct);

      classroomBreakdown = aggregateClassroomBreakdown(
        rows
          .map((r) => {
            const teacher = teacherBySessionId.get(r.session_id);
            return teacher
              ? {
                  teacherId: teacher.teacherId,
                  teacherName: teacher.teacherName,
                  sessionId: r.session_id,
                  skillAreaId: r.skill_areas.id,
                  score: r.score,
                  flagged: r.flagged_as_difficulty,
                }
              : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null),
        weightBySkillAreaId
      );
    }

    const { data: report } = await supabase
      .from("school_reports")
      .select("status, last_error")
      .eq("cycle_id", cycle.id)
      .maybeSingle();
    reportStatus = report?.status ?? null;
    reportLastError = report?.last_error ?? null;

    after(async () => {
      const admin = createAdminClient();
      await admin.from("audit_log").insert({
        actor_id: user.id,
        action: "report.view",
        resource_type: "school_report",
        resource_id: cycle.id,
      });
    });
  }

  const topFlagged = skillDistribution.filter((s) => s.pct > 0).slice(0, 2).map((s) => s.name);
  const planningNote = topFlagged.length > 0 ? `Most children need help with ${topFlagged.join(" and ")}.` : "No skill is hard for many children right now.";

  const downloads = cycle && studentsAssessed > 0;
  const quick = "block px-4 py-2.5 text-sm font-bold text-[var(--color-ink-soft)] no-underline hover:bg-[var(--color-neutral)]";

  return (
    <div className="w-full max-w-[920px]">
      <PageHeader
        title="Overview"
        subtitle={`${school?.name ?? "Your school"} · ${cycle?.name ?? "No active cycle"}`}
        actions={
          <>
            {reportStatus === "failed" && cycle && (
              <form action={retrySchoolReport}>
                <input type="hidden" name="cycleId" value={cycle.id} />
                <button type="submit" className={quietButton}>
                  Retry PDF
                </button>
              </form>
            )}
            {downloads && (
              <details className="relative">
                <summary className={`${quietButton} inline-flex list-none items-center gap-2 [&::-webkit-details-marker]:hidden`}>
                  Download <span aria-hidden="true">▾</span>
                </summary>
                <div className="absolute right-0 z-10 mt-2 w-60 overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.15)] border border-[var(--color-neutral-divider)]">
                  <a href={`/api/reports/school/${cycle.id}/bulk`} className={quick}>
                    All children&apos;s reports (PDF)
                  </a>
                  {reportStatus === "ready" ? (
                    <a href={`/api/reports/school/${cycle.id}`} className={quick}>
                      School report (PDF)
                    </a>
                  ) : (
                    <span className="block px-4 py-2.5 text-sm text-[var(--color-muted)]">School report is being made…</span>
                  )}
                  <a href={`/api/reports/school/${cycle.id}/csv`} className={quick}>
                    Spreadsheet (CSV)
                  </a>
                </div>
              </details>
            )}
          </>
        }
      />

      {reportStatus === "failed" && reportLastError && (
        <p role="status" className="text-[var(--color-orange-dark)] text-xs font-bold m-0 mb-6 -mt-4">
          PDF error: {reportLastError}
        </p>
      )}

        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <StatCard label="Students assessed" value={`${studentsAssessed} / ${studentsTotal ?? 0}`} />
          <StatCard label="Level" value={levelLabel(level)} />
          <StatCard label="Average score" value={`${avgOverallScore}%`} valueColor="var(--color-orange)" />
        </div>

        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5">
          <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-4.5">
            Skills children find hardest
          </div>
          <div className="flex flex-col gap-4">
            {skillDistribution.length === 0 && (
              <p className="text-[var(--color-muted)] text-sm m-0">No finished assessments yet.</p>
            )}
            {skillDistribution.map((sk) => (
              <div key={sk.name}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-bold text-[var(--color-ink-soft)]">{sk.name}</span>
                  <span className="font-bold text-[var(--color-orange-dark)]">{sk.pct}%</span>
                </div>
                <div className="h-3.5 bg-[var(--color-neutral-divider)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-orange)] rounded-full"
                    style={{ width: `${sk.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

      {classroomBreakdown.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5">
          <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-4.5">By class</div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-neutral-divider)]">
                <th className="text-left font-bold text-[var(--color-muted-light)] text-xs pb-2.5">Teacher</th>
                <th className="text-right font-bold text-[var(--color-muted-light)] text-xs pb-2.5">Students</th>
                <th className="text-right font-bold text-[var(--color-muted-light)] text-xs pb-2.5">Average</th>
                <th className="text-right font-bold text-[var(--color-muted-light)] text-xs pb-2.5">Need support</th>
              </tr>
            </thead>
            <tbody>
              {classroomBreakdown.map((c) => (
                <tr key={c.teacherId} className="border-b border-[var(--color-neutral-divider)] last:border-0">
                  <td className="py-2.5 font-bold text-[var(--color-ink-soft)]">{c.teacherName}</td>
                  <td className="py-2.5 text-right text-[var(--color-body)]">{c.studentsAssessed}</td>
                  <td className="py-2.5 text-right text-[var(--color-body)]">{c.avgScore}%</td>
                  <td className="py-2.5 text-right font-bold text-[var(--color-orange-dark)]">{c.pctNeedsSupport}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-[var(--color-orange-tint)] rounded-[24px] px-6.5 py-5.5 text-[var(--color-ink-soft)] text-sm leading-relaxed">
        {planningNote}
      </div>
    </div>
  );
}

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-[24px] p-5.5 shadow-[0_8px_24px_rgba(0,0,0,0.07)] transition-transform hover:-translate-y-0.5">
      <div className="text-[var(--color-muted-light)] text-[13px] font-bold mb-2">{label}</div>
      <div
        className="font-heading font-bold text-[30px]"
        style={{ color: valueColor ?? "var(--color-ink)" }}
      >
        {value}
      </div>
    </div>
  );
}
