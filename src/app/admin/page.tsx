import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrySchoolReport } from "./actions";

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
  if (!profile || profile.role !== "administrator") redirect("/");

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
  let gradeLevel = 1;
  let avgOverallScore = 0;
  let skillDistribution: { name: string; pct: number }[] = [];
  let reportStatus: string | null = null;

  if (cycle) {
    const { data: sessions } = await supabase
      .from("assessment_sessions")
      .select("id, student_id, students(grade)")
      .eq("cycle_id", cycle.id)
      .eq("status", "completed");

    const sessionIds = (sessions ?? []).map((s) => s.id);
    studentsAssessed = new Set((sessions ?? []).map((s) => s.student_id)).size;
    // @ts-expect-error -- joined relation shape isn't modeled in database.types.ts
    gradeLevel = sessions?.[0]?.students?.grade ?? 1;

    if (sessionIds.length > 0) {
      const { data: results } = await supabase
        .from("results")
        .select("session_id, score, flagged_as_difficulty, skill_areas(id, name)")
        .in("session_id", sessionIds);
      const rows = (results ?? []) as unknown as ResultRow[];

      avgOverallScore = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.score, 0) / rows.length) : 0;

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
    }

    const { data: report } = await supabase
      .from("school_reports")
      .select("status")
      .eq("cycle_id", cycle.id)
      .maybeSingle();
    reportStatus = report?.status ?? null;

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

  const topFlagged = skillDistribution.slice(0, 2).map((s) => s.name);
  const planningNote =
    topFlagged.length > 0
      ? `${topFlagged.join(" and ")} ${topFlagged.length > 1 ? "are" : "is"} the most common flagged area${
          topFlagged.length > 1 ? "s" : ""
        } this cycle. Consider prioritizing intervention resources for ${
          topFlagged.length > 1 ? "these skill areas" : "this skill area"
        } across Grade ${gradeLevel} classrooms.`
      : "No skill areas are broadly flagged this cycle.";

  return (
    <div className="w-full max-w-[920px]">
      <div className="flex justify-between items-start flex-wrap gap-3.5 mb-6">
          <div>
            <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-sage-deep)] m-0 mb-1">
              {school?.name ?? "Your School"}
            </h1>
            <p className="text-[var(--color-muted)] text-[15px] m-0">
              School-Wide Report · {cycle?.name ?? "No active cycle"}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {cycle && studentsAssessed > 0 && (
              <a
                href={`/api/reports/school/${cycle.id}/csv`}
                className="bg-[var(--color-neutral)] border-none text-[var(--color-sage-dark)] font-bold text-sm px-4.5 py-2.5 rounded-full no-underline transition-colors hover:bg-[var(--color-neutral-divider)]"
              >
                Export CSV
              </a>
            )}
            {reportStatus === "ready" && cycle ? (
              <a
                href={`/api/reports/school/${cycle.id}`}
                className="bg-[var(--color-neutral)] border-none text-[var(--color-sage-dark)] font-bold text-sm px-4.5 py-2.5 rounded-full no-underline transition-colors hover:bg-[var(--color-neutral-divider)]"
              >
                Export PDF
              </a>
            ) : reportStatus === "failed" && cycle ? (
              <form action={retrySchoolReport}>
                <input type="hidden" name="cycleId" value={cycle.id} />
                <button
                  type="submit"
                  className="bg-[var(--color-terracotta-tint)] border-none text-[var(--color-terracotta-dark)] font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer"
                >
                  Retry PDF
                </button>
              </form>
            ) : (
              <span className="bg-[var(--color-neutral)] border-none text-[var(--color-muted)] font-bold text-sm px-4.5 py-2.5 rounded-full">
                PDF pending
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <StatCard label="Students Assessed" value={`${studentsAssessed} / ${studentsTotal ?? 0}`} />
          <StatCard label="Grade Level" value={`Grade ${gradeLevel}`} />
          <StatCard label="Avg. Overall Score" value={`${avgOverallScore}%`} valueColor="var(--color-sage)" />
        </div>

        <div className="bg-white rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5">
          <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4.5">
            Difficulty Area Distribution (% of students flagged)
          </div>
          <div className="flex flex-col gap-4">
            {skillDistribution.length === 0 && (
              <p className="text-[var(--color-muted)] text-sm m-0">No completed assessments yet this cycle.</p>
            )}
            {skillDistribution.map((sk) => (
              <div key={sk.name}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-bold text-[var(--color-ink-soft)]">{sk.name}</span>
                  <span className="font-bold text-[var(--color-gold-text)]">{sk.pct}% flagged</span>
                </div>
                <div className="h-3.5 bg-[var(--color-neutral-divider)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-terracotta)] rounded-full"
                    style={{ width: `${sk.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

      <div className="bg-[var(--color-sage-tint)] rounded-[24px] px-6.5 py-5.5 text-[var(--color-ink-soft)] text-sm leading-relaxed">
        <strong className="text-[var(--color-sage-deep)]">Planning note:</strong> {planningNote}
      </div>
    </div>
  );
}

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="bg-white rounded-[24px] p-5.5 shadow-[0_8px_24px_rgba(0,0,0,0.07)] transition-transform hover:-translate-y-0.5">
      <div className="text-[var(--color-muted-light)] text-[13px] font-bold mb-2">{label}</div>
      <div
        className="font-heading font-bold text-[30px]"
        style={{ color: valueColor ?? "var(--color-sage-deep)" }}
      >
        {value}
      </div>
    </div>
  );
}
