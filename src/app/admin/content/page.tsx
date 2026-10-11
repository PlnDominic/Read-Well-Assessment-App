import { redirect } from "next/navigation";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FLAGGED_SCORE_THRESHOLD } from "@/lib/theme";
import { SkillAreasEditor } from "./SkillAreasEditor";
import { SkillWeightsEditor } from "./SkillWeightsEditor";
import { addRecommendationRule, deleteRecommendationRule } from "./actions";
import { FORM_OPTIONS, LEVEL_OPTIONS, formLabel, levelLabel, type AssessmentForm } from "@/lib/levels";
import { formForItems } from "@/lib/readwell/forms";

type RuleRow = {
  id: string;
  recommendation_text: string;
  program_reference: string | null;
  skill_areas: { id: string; name: string };
};

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const { level: levelParam } = await searchParams;
  const LEVEL = levelParam && LEVEL_OPTIONS.includes(Number(levelParam)) ? Number(levelParam) : 1;

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
  const weightBySkillAreaId = new Map((weightRows ?? []).map((w) => [w.skill_area_id, w]));

  const { data: allAssessmentItems } = await supabase.from("assessments").select("items");
  const usedSkillAreaKeys = new Set<string>();
  for (const a of allAssessmentItems ?? []) {
    for (const item of a.items) usedSkillAreaKeys.add(item.skillAreaKey);
  }
  const { data: allRuleSkillAreaIds } = await supabase.from("recommendation_rules").select("skill_area_id");
  const usedSkillAreaIds = new Set((allRuleSkillAreaIds ?? []).map((r) => r.skill_area_id));

  const { data: levelAssessments } = await supabase
    .from("assessments")
    .select("form, version, items")
    .eq("level", LEVEL)
    .eq("is_active", true)
    .not("form", "is", null);
  const assessmentByForm = new Map((levelAssessments ?? []).map((a) => [a.form as AssessmentForm, a]));

  const { data: rulesData } = await supabase
    .from("recommendation_rules")
    .select("id, recommendation_text, program_reference, skill_areas(id, name)")
    .eq("level", LEVEL);
  const rules = (rulesData ?? []) as unknown as RuleRow[];

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-ink)] m-0 mb-1">Content</h1>
      <p className="text-[var(--color-muted)] text-sm m-0 mb-5">
        Skill areas, weighting and recommendations are edited here, with no code deploy. Pick a level to see its
        assessments and recommendations.
      </p>

      <div className="inline-flex gap-1 mb-6 flex-wrap bg-[var(--color-surface)] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.05)] p-1.5">
        {LEVEL_OPTIONS.map((g) => (
          <Link
            key={g}
            href={`/admin/content?level=${g}`}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold no-underline transition-colors"
            style={{
              background: g === LEVEL ? "var(--color-orange)" : "transparent",
              color: g === LEVEL ? "white" : "var(--color-muted)",
              boxShadow: g === LEVEL ? "0 4px 10px rgba(74,107,82,0.3)" : "none",
            }}
          >
            {levelLabel(g)}
          </Link>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-6">
        <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-4.5">Skill areas</div>
        <SkillAreasEditor
          skillAreas={(skillAreas ?? []).map((sa) => ({
            ...sa,
            inUse: usedSkillAreaKeys.has(sa.key) || usedSkillAreaIds.has(sa.id),
          }))}
        />
      </div>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-6">
        <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-1.5">Skill area weighting</div>
        <p className="text-[var(--color-muted)] text-sm mb-4 mt-0">
          Weight changes how much a skill area counts toward the school-wide average score. The flag threshold
          overrides the {FLAGGED_SCORE_THRESHOLD}% default just for that skill area; leave it blank to use the
          default.
        </p>
        <SkillWeightsEditor
          skillAreas={(skillAreas ?? []).map((sa) => ({
            id: sa.id,
            name: sa.name,
            weight: weightBySkillAreaId.get(sa.id)?.weight ?? 1,
            flaggedThreshold: weightBySkillAreaId.get(sa.id)?.flagged_threshold ?? null,
          }))}
        />
      </div>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-6">
        <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-1.5">{levelLabel(LEVEL)} assessments</div>
        <p className="text-[var(--color-muted)] text-sm mt-0 mb-4.5">
          Each level has four assessments. Teachers pick which one a child takes when they start it. The assessor
          guide is the master copy of each, so they aren&apos;t edited here: send a guide in and it&apos;s added to the
          app with the same item codes as the paper version.
        </p>
        <div className="flex flex-col gap-3">
          {FORM_OPTIONS.map((form) => {
            const assessment = assessmentByForm.get(form);
            return (
              <div key={form} className="bg-[var(--color-neutral)] rounded-xl px-4.5 py-3.5">
                <div className="flex justify-between items-baseline gap-3 flex-wrap mb-1">
                  <span className="font-extrabold text-[var(--color-ink)] text-sm">{formLabel(form)}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {assessment ? `Version ${assessment.version}` : "Not added yet"}
                  </span>
                </div>
                {assessment ? (
                  <AssessorFormSummary items={assessment.items} />
                ) : (
                  <p className="text-sm text-[var(--color-muted)] m-0">
                    Teachers can&apos;t pick this one until its assessor guide has been added.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5">
        <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-4.5">
          Program-aligned recommendations
        </div>

        <div className="flex flex-col gap-3 mb-5">
          {rules.length === 0 && (
            <p className="text-[var(--color-muted)] text-sm m-0">No recommendation rules yet.</p>
          )}
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-start justify-between gap-3 bg-[var(--color-neutral)] rounded-xl px-4.5 py-3.5"
            >
              <div>
                <div className="font-extrabold text-[var(--color-ink)] text-sm mb-1">
                  {rule.skill_areas.name}
                </div>
                <div className="text-[var(--color-body)] text-sm">{rule.recommendation_text}</div>
                {rule.program_reference && (
                  <div className="text-[var(--color-muted-light)] text-xs mt-1">{rule.program_reference}</div>
                )}
              </div>
              <form action={deleteRecommendationRule}>
                <input type="hidden" name="id" value={rule.id} />
                <button
                  type="submit"
                  className="text-[var(--color-orange-dark)] text-xs font-bold bg-none border-none cursor-pointer whitespace-nowrap"
                >
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>

        <form action={addRecommendationRule} className="flex flex-col gap-3 border-t border-[var(--color-neutral-divider)] pt-5">
          <input type="hidden" name="level" value={LEVEL} />
          <div className="flex flex-wrap gap-3">
            <select
              name="skillAreaId"
              aria-label="Skill area"
              required
              className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Skill area…
              </option>
              {(skillAreas ?? []).map((sa) => (
                <option key={sa.id} value={sa.id}>
                  {sa.name}
                </option>
              ))}
            </select>
            <input
              name="programReference"
              aria-label="Program reference (optional)"
              placeholder="Program reference (optional)"
              className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm flex-1 min-w-[200px]"
            />
          </div>
          <textarea
            name="text"
            aria-label="Recommendation text"
            required
            placeholder="Recommendation text"
            rows={2}
            className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm"
          />
          <button
            type="submit"
            className="self-start bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-4.5 py-2.25 cursor-pointer"
          >
            Add rule
          </button>
        </form>
      </div>
    </div>
  );
}

/** What an added assessment contains, from its form definition and stored items. */
function AssessorFormSummary({ items }: { items: Parameters<typeof formForItems>[0] }) {
  const form = formForItems(items);
  if (!form) return <p className="text-sm text-[var(--color-body)] m-0">{items.length} items.</p>;
  return (
    <div className="text-sm text-[var(--color-body)]">
      <p className="m-0 mb-1.5">
        {form.title}: {items.length} item codes in {form.parts.length} parts, given one to one on the assessor screen.
      </p>
      <p className="m-0 text-xs text-[var(--color-muted)]">
        {form.parts.map((part) => `${part.number} ${part.title}`).join(" · ")}
      </p>
    </div>
  );
}
