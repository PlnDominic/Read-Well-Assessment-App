import { notFound, redirect } from "next/navigation";
import { pathForUnauthorizedProfile } from "@/lib/staffRouting";
import { createClient } from "@/lib/supabase/server";
import { FORM_OPTIONS, isAssessmentForm, isValidLevel } from "@/lib/levels";
import { partsFor } from "@/lib/gameParts";
import { GameEditor } from "./GameEditor";

/**
 * Content → Assessments → a form's game: build or edit the questions a
 * child plays for one level and form, and publish them as a new version.
 */
export default async function GameEditorPage({ params }: { params: Promise<{ level: string; form: string }> }) {
  const { level: levelParam, form } = await params;
  const level = Number(levelParam);
  if (!isValidLevel(level) || !isAssessmentForm(form)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect(pathForUnauthorizedProfile(profile));

  const { data: skillAreas } = await supabase.from("skill_areas").select("key, name").order("name");
  const { data: games } = await supabase
    .from("assessments")
    .select("form, show_feedback, items, created_at")
    .eq("level", level)
    .eq("delivery", "game")
    .eq("is_active", true)
    .not("form", "is", null);
  const game = (games ?? []).find((g) => g.form === form) ?? null;
  // The other forms' games at this level, for starting a new one from a copy.
  const copySources = FORM_OPTIONS.filter((f) => f !== form)
    .map((f) => (games ?? []).find((g) => g.form === f))
    .filter((g) => !!g)
    .map((g) => ({ form: g.form!, items: g.items }));

  return (
    <div className="w-full max-w-[920px]">
      <GameEditor
        level={level}
        form={form}
        parts={partsFor(level)}
        initialItems={game?.items ?? []}
        initialShowFeedback={game?.show_feedback ?? true}
        publishedAt={game?.created_at ?? null}
        skillAreas={skillAreas ?? []}
        copySources={copySources}
      />
    </div>
  );
}
