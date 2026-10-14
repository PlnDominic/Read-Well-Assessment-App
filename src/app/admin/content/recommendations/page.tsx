import { redirect } from "next/navigation";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { levelLabel } from "@/lib/levels";
import { deleteRecommendationRule } from "../actions";
import { ContentHeader, LevelPicker, cardClass, levelFromParam } from "../ContentHeader";
import { AddRecommendationForm } from "./AddRecommendationForm";

type RuleRow = {
  id: string;
  level: number;
  skill_area_id: string;
  recommendation_text: string;
  program_reference: string | null;
};

/**
 * Content → Recommendations: for one level, the next steps a child's report
 * suggests for each skill area they're flagged in (getRecommendations in
 * src/lib/recommendations.ts), grouped by skill area.
 */
export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const LEVEL = levelFromParam((await searchParams).level);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect(pathForUnauthorizedProfile(profile));

  const { data: skillAreas } = await supabase.from("skill_areas").select("id, name").order("name");
  const { data: rulesData } = await supabase
    .from("recommendation_rules")
    .select("id, level, skill_area_id, recommendation_text, program_reference")
    .order("created_at");
  const allRules = (rulesData ?? []) as RuleRow[];
  const rules = allRules.filter((r) => r.level === LEVEL);

  const perLevel: Record<number, number> = {};
  for (const r of allRules) perLevel[r.level] = (perLevel[r.level] ?? 0) + 1;
  const notes = Object.fromEntries(
    Object.entries(perLevel).map(([level, n]) => [level, `${n} step${n === 1 ? "" : "s"}`])
  ) as Record<number, string>;

  const withRules = (skillAreas ?? []).filter((sa) => rules.some((r) => r.skill_area_id === sa.id));
  const withoutRules = (skillAreas ?? []).filter((sa) => !rules.some((r) => r.skill_area_id === sa.id));

  return (
    <div className="w-full max-w-[920px]">
      <ContentHeader
        tab="recommendations"
        intro="What a report suggests when a child is flagged in a skill."
      />
      <LevelPicker level={LEVEL} basePath="/admin/content/recommendations" notes={notes} />

      <section className={`${cardClass} px-5 py-5 sm:px-7 mb-5`} aria-labelledby="add-step">
        <h2 id="add-step" className="font-heading font-bold text-base text-[var(--color-ink)] m-0 mb-3">
          Add a next step for {levelLabel(LEVEL)}
        </h2>
        <AddRecommendationForm level={LEVEL} skillAreas={skillAreas ?? []} />
      </section>

      <h2 className="font-heading font-bold text-lg text-[var(--color-ink)] m-0 mb-3">{levelLabel(LEVEL)}</h2>
      {withRules.length === 0 && (
        <p className="text-sm text-[var(--color-muted)] m-0 mb-4">
          None yet.
        </p>
      )}
      <div className="flex flex-col gap-3 mb-5">
        {withRules.map((sa) => (
          <section key={sa.id} className={`${cardClass} px-5 py-4 sm:px-7`} aria-label={sa.name}>
            <h3 className="font-bold text-sm text-[var(--color-ink)] m-0 mb-2">When flagged in {sa.name}</h3>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {rules
                .filter((r) => r.skill_area_id === sa.id)
                .map((rule) => (
                  <li key={rule.id} className="flex items-start justify-between gap-3 rounded-xl bg-[var(--color-neutral)] px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--color-ink)]">{rule.recommendation_text}</div>
                      {rule.program_reference && (
                        <div className="text-xs text-[var(--color-muted)] mt-1">From: {rule.program_reference}</div>
                      )}
                    </div>
                    <form action={deleteRecommendationRule}>
                      <input type="hidden" name="id" value={rule.id} />
                      <ConfirmSubmitButton
                        confirmMessage="Delete this next step?"
                        className="border-0 bg-transparent p-0 text-xs font-bold text-[var(--color-orange-dark)] cursor-pointer whitespace-nowrap"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      {withRules.length > 0 && withoutRules.length > 0 && (
        <p className="text-sm text-[var(--color-muted)] m-0">
          Nothing yet for: {withoutRules.map((sa) => sa.name).join(", ")}.
        </p>
      )}
    </div>
  );
}
