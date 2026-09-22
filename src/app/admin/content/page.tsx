import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AssessmentItemsEditor } from "./AssessmentItemsEditor";
import { addRecommendationRule, deleteRecommendationRule } from "./actions";

const GRADE_LEVEL = 1; // only Grade 1 is in scope for this release (PRD §6)

type RuleRow = {
  id: string;
  recommendation_text: string;
  program_reference: string | null;
  skill_areas: { id: string; name: string };
};

export default async function AdminContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect("/");

  const { data: skillAreas } = await supabase.from("skill_areas").select("id, key, name").order("name");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("items, version")
    .eq("grade_level", GRADE_LEVEL)
    .eq("is_active", true)
    .maybeSingle();

  const { data: rulesData } = await supabase
    .from("recommendation_rules")
    .select("id, recommendation_text, program_reference, skill_areas(id, name)")
    .eq("grade_level", GRADE_LEVEL);
  const rules = (rulesData ?? []) as unknown as RuleRow[];

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[26px] text-[var(--color-sage-deep)] m-0 mb-1">Content</h1>
      <p className="text-[var(--color-muted)] text-sm m-0 mb-6">
        Edits here don&apos;t require a code deploy — saving the assessment creates a new version so past
        sessions keep the content they were assessed against.
      </p>

      <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] px-8 py-7.5 mb-6">
        <div className="flex items-center justify-between mb-4.5">
          <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)]">
            Grade {GRADE_LEVEL} assessment items
          </div>
          {assessment && (
            <span className="text-xs text-[var(--color-muted)]">Current version: {assessment.version}</span>
          )}
        </div>
        <AssessmentItemsEditor
          gradeLevel={GRADE_LEVEL}
          initialItems={assessment?.items ?? []}
          skillAreas={skillAreas ?? []}
        />
      </div>

      <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] px-8 py-7.5">
        <div className="font-heading font-bold text-sm text-[var(--color-sage-deep)] mb-4.5">
          Program-aligned recommendations
        </div>

        <div className="flex flex-col gap-3 mb-5">
          {rules.length === 0 && (
            <p className="text-[var(--color-muted)] text-sm m-0">No recommendation rules yet.</p>
          )}
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-start justify-between gap-3 bg-[var(--color-cream)] rounded-xl px-4.5 py-3.5"
            >
              <div>
                <div className="font-extrabold text-[var(--color-sage-deep)] text-sm mb-1">
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
                  className="text-[var(--color-terracotta-dark)] text-xs font-bold bg-none border-none cursor-pointer whitespace-nowrap"
                >
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>

        <form action={addRecommendationRule} className="flex flex-col gap-3 border-t border-[var(--color-cream-divider)] pt-5">
          <input type="hidden" name="gradeLevel" value={GRADE_LEVEL} />
          <div className="flex flex-wrap gap-3">
            <select
              name="skillAreaId"
              required
              className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5 text-sm"
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
              placeholder="Program reference (optional)"
              className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5 text-sm flex-1 min-w-[200px]"
            />
          </div>
          <textarea
            name="text"
            required
            placeholder="Recommendation text"
            rows={2}
            className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5 text-sm"
          />
          <button
            type="submit"
            className="self-start bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm px-4.5 py-2.25 cursor-pointer"
          >
            Add rule
          </button>
        </form>
      </div>
    </div>
  );
}
