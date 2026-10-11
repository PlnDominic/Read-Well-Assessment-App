"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssessmentItem } from "@/lib/database.types";
import { isAssessmentForm, isValidLevel } from "@/lib/levels";
import { orderByPart, validateGameItems } from "@/lib/gameItems";
import { partsFor } from "@/lib/gameParts";
import { skillKeyFromName } from "@/lib/skillAreas";

/**
 * What a Content form shows after it's sent. Errors are returned, not
 * thrown: a production build replaces a thrown server action error's
 * message with a generic one, so the person would never learn what to fix.
 */
export type ActionResult = { ok: boolean; message: string } | null;

const fail = (message: string): ActionResult => ({ ok: false, message });

// Every Content page (the tabs and the game editor) shows data these change.
const refresh = () => revalidatePath("/admin/content", "layout");

/**
 * Saves the game version of a form (choice, read-aloud and writing items
 * the child answers on their own device) for one level and form. A form
 * given by an adult from its ReadWell guide is a separate row (delivery
 * 'assessor', 0018) managed from its item bank, so this never touches it.
 *
 * The items are saved in mission order (orderByPart), each part's
 * questions together, so the game never splits a part into two missions.
 *
 * show_feedback (0019) is saved false: the game no longer tells children
 * right from wrong. Older versions keep the value they were given with.
 *
 * assessments has no client-facing write policy (see 0002_rls.sql) so this
 * needs the service role, gated by requireAdmin(). Saving creates a new version rather than
 * mutating in place, so past sessions keep pointing at the exact content
 * they were assessed against (TRD §3: Assessment.version).
 */
export async function saveAssessmentItems(
  level: number,
  form: string,
  items: AssessmentItem[]
): Promise<{ ok: true; version: number } | { ok: false; message: string }> {
  await requireAdmin();
  if (!isValidLevel(level) || !isAssessmentForm(form)) return { ok: false, message: "Pick a level and form." };
  const [problem] = validateGameItems(items);
  if (problem) {
    const where = problem.index >= 0 ? `Question ${items[problem.index].id}: ` : "";
    return { ok: false, message: `${where}${problem.message}` };
  }
  const ordered = orderByPart(items, partsFor(level));

  const admin = createAdminClient();
  const { data: versions } = await admin
    .from("assessments")
    .select("id, version, is_active")
    .eq("level", level)
    .eq("form", form)
    .eq("delivery", "game")
    .order("version", { ascending: false });
  const current = (versions ?? []).find((v) => v.is_active);
  const version = (versions?.[0]?.version ?? 0) + 1;

  // At most one active version per level, form and delivery (0018),
  // so the old one is switched off before the new one goes in, and back
  // on if the insert fails.
  if (current) {
    const { error } = await admin.from("assessments").update({ is_active: false }).eq("id", current.id);
    if (error) return { ok: false, message: error.message };
  }
  const { error: insertError } = await admin.from("assessments").insert({
    level,
    form,
    delivery: "game",
    show_feedback: false,
    version,
    items: ordered,
    is_active: true,
  });
  if (insertError) {
    if (current) await admin.from("assessments").update({ is_active: true }).eq("id", current.id);
    return { ok: false, message: insertError.message };
  }

  refresh();
  return { ok: true, version };
}

export async function addRecommendationRule(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const skillAreaId = String(formData.get("skillAreaId") ?? "");
  const level = Number(formData.get("level") ?? 1);
  const text = String(formData.get("text") ?? "").trim();
  const programReference = String(formData.get("programReference") ?? "").trim() || null;
  if (!skillAreaId) return fail("Pick the skill area this is for.");
  if (!text) return fail("Write what the teacher should do.");
  if (!isValidLevel(level)) return fail("Pick a level.");

  const admin = createAdminClient();
  const { error } = await admin.from("recommendation_rules").insert({
    skill_area_id: skillAreaId,
    level,
    recommendation_text: text,
    program_reference: programReference,
  });
  if (error) return fail(error.message);

  refresh();
  return { ok: true, message: "Added." };
}

export async function deleteRecommendationRule(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { error } = await admin.from("recommendation_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);

  refresh();
}

/**
 * Adds a skill area from its name alone. The key game items refer to it by
 * is made from the name ("Oral language" → oralLanguage), numbered if
 * that's taken, so nobody has to invent one.
 */
export async function addSkillArea(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const base = skillKeyFromName(name);
  if (!name || !base) return fail("Give the skill area a name with at least one letter.");

  const admin = createAdminClient();
  const { data: existing } = await admin.from("skill_areas").select("key, name");
  if ((existing ?? []).some((sa) => sa.name.toLowerCase() === name.toLowerCase())) {
    return fail(`There is already a skill area called ${name}.`);
  }
  const taken = new Set((existing ?? []).map((sa) => sa.key.toLowerCase()));
  let key = base;
  for (let n = 2; taken.has(key.toLowerCase()); n++) key = `${base}${n}`;

  const { error } = await admin.from("skill_areas").insert({ key, name });
  if (error) return fail(error.message);

  refresh();
  return { ok: true, message: `Added ${name}.` };
}

/**
 * Saves one skill area's row: its name (for every school), and this
 * school's weight and flag line (supabase/migrations/0011_school_skill_weights.sql):
 * how much it counts toward the weighted overall score, and an optional
 * flagged-score threshold in place of the global default (lib/theme.ts's
 * FLAGGED_SCORE_THRESHOLD). A blank threshold clears the override; a
 * weight of exactly 1 with no threshold override removes the row, since
 * that's the same as having none.
 */
export async function saveSkillArea(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { profile } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return fail("Missing skill area.");
  if (!name) return fail("Give it a name.");

  const weight = Number(String(formData.get("weight") ?? "1").trim());
  if (!Number.isFinite(weight) || weight <= 0) return fail("Weight must be a number above 0, like 1 or 1.5.");

  const thresholdRaw = String(formData.get("flaggedThreshold") ?? "").trim();
  let flaggedThreshold: number | null = null;
  if (thresholdRaw) {
    flaggedThreshold = Number(thresholdRaw);
    if (!Number.isInteger(flaggedThreshold) || flaggedThreshold < 0 || flaggedThreshold > 100) {
      return fail("The flag line must be a whole number from 0 to 100, or blank.");
    }
  }

  const admin = createAdminClient();
  const { error: nameError } = await admin.from("skill_areas").update({ name }).eq("id", id);
  if (nameError) return fail(nameError.message);

  const { error } =
    weight === 1 && flaggedThreshold === null
      ? await admin.from("school_skill_weights").delete().eq("school_id", profile.school_id).eq("skill_area_id", id)
      : await admin
          .from("school_skill_weights")
          .upsert(
            { school_id: profile.school_id, skill_area_id: id, weight, flagged_threshold: flaggedThreshold },
            { onConflict: "school_id,skill_area_id" }
          );
  if (error) return fail(error.message);

  refresh();
  return { ok: true, message: "Saved." };
}

/** Only allowed when nothing uses it: no recommendation, and no question in any assessment. */
export async function deleteSkillArea(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { data: skillArea } = await admin.from("skill_areas").select("key").eq("id", id).maybeSingle();
  if (!skillArea) return fail("That skill area is already gone.");

  const { count: ruleCount } = await admin
    .from("recommendation_rules")
    .select("id", { count: "exact", head: true })
    .eq("skill_area_id", id);
  if ((ruleCount ?? 0) > 0) return fail("A recommendation uses this skill area. Delete that first.");

  const { data: assessments } = await admin.from("assessments").select("items");
  if ((assessments ?? []).some((a) => a.items.some((item) => item.skillAreaKey === skillArea.key))) {
    return fail("Questions in an assessment use this skill area, so it can't be deleted.");
  }

  const { error } = await admin.from("skill_areas").delete().eq("id", id);
  if (error) return fail(error.message);

  refresh();
  return { ok: true, message: "Deleted." };
}
