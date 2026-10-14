import { redirect } from "next/navigation";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { createClient } from "@/lib/supabase/server";
import { FLAGGED_SCORE_THRESHOLD } from "@/lib/theme";
import { ContentHeader, cardClass } from "../ContentHeader";
import { AddSkillAreaForm, SkillAreaRow } from "./SkillAreaRow";

/**
 * Content → Skills and scoring: the skill areas questions count toward,
 * and, for this school, how much each counts in the overall score and the
 * score below which a child is flagged in it.
 */
export default async function SkillsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect(pathForUnauthorizedProfile(profile));

  const { data: skillAreas } = await supabase.from("skill_areas").select("id, key, name").order("name");
  const { data: weightRows } = await supabase
    .from("school_skill_weights")
    .select("skill_area_id, weight, flagged_threshold")
    .eq("school_id", profile.school_id);
  const weightById = new Map((weightRows ?? []).map((w) => [w.skill_area_id, w]));

  // What uses each skill area: questions in the forms teachers can start
  // now, and recommendations. Old versions count too when deciding whether
  // it can be deleted, since past sessions still point at them.
  const { data: assessments } = await supabase.from("assessments").select("items, is_active");
  const activeQuestions = new Map<string, number>();
  const everUsed = new Set<string>();
  for (const a of assessments ?? []) {
    for (const item of a.items) {
      everUsed.add(item.skillAreaKey);
      if (a.is_active) activeQuestions.set(item.skillAreaKey, (activeQuestions.get(item.skillAreaKey) ?? 0) + 1);
    }
  }
  const { data: rules } = await supabase.from("recommendation_rules").select("skill_area_id");
  const ruleCount = new Map<string, number>();
  for (const r of rules ?? []) ruleCount.set(r.skill_area_id, (ruleCount.get(r.skill_area_id) ?? 0) + 1);

  return (
    <div className="w-full max-w-[920px]">
      <ContentHeader
        tab="skills"
        intro="Each question counts toward one skill. Set how your school scores them."
      />

      <div className="grid gap-3 sm:grid-cols-2 mb-5">
        <Explainer title="Counts">How much a skill weighs in the overall score. 1 is normal.</Explainer>
        <Explainer title="Flag below">
          Children scoring under this are flagged for support. Blank means {FLAGGED_SCORE_THRESHOLD}%.
        </Explainer>
      </div>

      <section className={`${cardClass} px-4 py-4 sm:px-6 mb-5`} aria-label="Skill areas">
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_96px_116px_150px] gap-3 px-2 pb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
          <span>Skill area</span>
          <span>Counts</span>
          <span>Flag below</span>
          <span />
        </div>
        <div className="flex flex-col divide-y divide-[var(--color-neutral-divider)]">
          {(skillAreas ?? []).map((sa) => {
            const questions = activeQuestions.get(sa.key) ?? 0;
            const recs = ruleCount.get(sa.id) ?? 0;
            const usage = [
              questions ? `${questions} question${questions === 1 ? "" : "s"}` : null,
              recs ? `${recs} next step${recs === 1 ? "" : "s"}` : null,
            ].filter(Boolean);
            return (
              <SkillAreaRow
                key={sa.id}
                id={sa.id}
                name={sa.name}
                weight={weightById.get(sa.id)?.weight ?? 1}
                flaggedThreshold={weightById.get(sa.id)?.flagged_threshold ?? null}
                defaultThreshold={FLAGGED_SCORE_THRESHOLD}
                usage={usage.length ? `Used by ${usage.join(" and ")}` : everUsed.has(sa.key) ? "Used by older versions" : "Not used yet"}
                canDelete={!everUsed.has(sa.key) && recs === 0}
              />
            );
          })}
        </div>
      </section>

      <section className={`${cardClass} px-5 py-5 sm:px-7`} aria-labelledby="add-skill">
        <h2 id="add-skill" className="font-heading font-bold text-base text-[var(--color-ink)] m-0 mb-1">
          Add a skill area
        </h2>
        <p className="text-sm text-[var(--color-muted)] m-0 mb-3">
          Names are shared by every school. Counts and Flag below are only yours.
        </p>
        <AddSkillAreaForm />
      </section>
    </div>
  );
}

function Explainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-[var(--color-neutral-divider)] px-4 py-3.5">
      <div className="font-bold text-sm text-[var(--color-ink)] mb-0.5">{title}</div>
      <p className="text-[13px] leading-relaxed text-[var(--color-body)] m-0">{children}</p>
    </div>
  );
}
