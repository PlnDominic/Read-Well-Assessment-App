"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssessmentItem } from "@/lib/database.types";

function validateItems(items: AssessmentItem[]) {
  if (items.length === 0) throw new Error("At least one item is required");
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id.trim()) throw new Error("Every item needs an id");
    if (ids.has(item.id)) throw new Error(`Duplicate item id: ${item.id}`);
    ids.add(item.id);
    if (!item.prompt.trim()) throw new Error(`Item ${item.id} needs a prompt`);
    if (!item.skillAreaKey) throw new Error(`Item ${item.id} needs a skill area`);
    if (item.type === "choice") {
      if (!item.options || item.options.length < 2) {
        throw new Error(`Item ${item.id} needs at least 2 options`);
      }
      if (!item.options.some((o) => o.isCorrect)) {
        throw new Error(`Item ${item.id} needs one option marked correct`);
      }
      if (item.options.some((o) => !o.text.trim())) {
        throw new Error(`Item ${item.id} has an empty option`);
      }
    }
  }
}

/**
 * assessments has no client-facing write policy (see 0002_rls.sql) so this
 * needs the service role, gated by requireAdmin(). Saving creates a new
 * version rather than mutating in place, so past sessions keep pointing at
 * the exact content they were assessed against (TRD §3: Assessment.version).
 */
export async function saveAssessmentItems(gradeLevel: number, items: AssessmentItem[]) {
  await requireAdmin();
  validateItems(items);

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("assessments")
    .select("id, version")
    .eq("grade_level", gradeLevel)
    .eq("is_active", true)
    .maybeSingle();

  const nextVersion = (current?.version ?? 0) + 1;
  const { error: insertError } = await admin.from("assessments").insert({
    grade_level: gradeLevel,
    version: nextVersion,
    items,
    is_active: true,
  });
  if (insertError) throw new Error(insertError.message);

  if (current) {
    const { error: deactivateError } = await admin
      .from("assessments")
      .update({ is_active: false })
      .eq("id", current.id);
    if (deactivateError) throw new Error(deactivateError.message);
  }

  revalidatePath("/admin/content");
}

export async function addRecommendationRule(formData: FormData) {
  await requireAdmin();

  const skillAreaId = String(formData.get("skillAreaId") ?? "");
  const gradeLevel = Number(formData.get("gradeLevel") ?? 1);
  const text = String(formData.get("text") ?? "").trim();
  const programReference = String(formData.get("programReference") ?? "").trim() || null;
  if (!skillAreaId || !text) throw new Error("Skill area and recommendation text are required");

  const admin = createAdminClient();
  const { error } = await admin.from("recommendation_rules").insert({
    skill_area_id: skillAreaId,
    grade_level: gradeLevel,
    recommendation_text: text,
    program_reference: programReference,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/content");
}

export async function deleteRecommendationRule(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { error } = await admin.from("recommendation_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/content");
}

export async function addSkillArea(formData: FormData) {
  await requireAdmin();

  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
    throw new Error("Key must be letters/numbers only, starting with a letter (e.g. \"phonics\")");
  }
  if (!name) throw new Error("Name is required");

  const admin = createAdminClient();
  const { error } = await admin.from("skill_areas").insert({ key, name });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/content");
}

export async function renameSkillArea(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) throw new Error("Name is required");

  const admin = createAdminClient();
  const { error } = await admin.from("skill_areas").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/content");
}

/**
 * Upserts this school's override for one skill area (supabase/migrations/
 * 0011_school_skill_weights.sql): how much it counts toward the weighted
 * overall score, and an optional per-skill flagged-score threshold in
 * place of the global default (lib/theme.ts's FLAGGED_SCORE_THRESHOLD).
 * A blank threshold field clears the override rather than writing an
 * empty string; a weight of exactly 1 with no threshold override is
 * removed entirely, since that's the same as having no row at all.
 */
export async function updateSkillWeight(formData: FormData) {
  const { profile } = await requireAdmin();

  const skillAreaId = String(formData.get("skillAreaId") ?? "");
  if (!skillAreaId) throw new Error("Missing skill area id");

  const weightRaw = String(formData.get("weight") ?? "1").trim();
  const weight = Number(weightRaw);
  if (!Number.isFinite(weight) || weight <= 0) throw new Error("Weight must be a positive number");

  const thresholdRaw = String(formData.get("flaggedThreshold") ?? "").trim();
  let flaggedThreshold: number | null = null;
  if (thresholdRaw) {
    flaggedThreshold = Number(thresholdRaw);
    if (!Number.isInteger(flaggedThreshold) || flaggedThreshold < 0 || flaggedThreshold > 100) {
      throw new Error("Flagged threshold must be a whole number between 0 and 100");
    }
  }

  const admin = createAdminClient();

  if (weight === 1 && flaggedThreshold === null) {
    const { error } = await admin
      .from("school_skill_weights")
      .delete()
      .eq("school_id", profile.school_id)
      .eq("skill_area_id", skillAreaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from("school_skill_weights")
      .upsert(
        { school_id: profile.school_id, skill_area_id: skillAreaId, weight, flagged_threshold: flaggedThreshold },
        { onConflict: "school_id,skill_area_id" }
      );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin/content");
}

/** Only allowed when nothing references it; see the inUse check built in
 * AdminContentPage (scans every assessment's items and recommendation_rules). */
export async function deleteSkillArea(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const key = String(formData.get("key") ?? "");
  const admin = createAdminClient();

  const { count: ruleCount } = await admin
    .from("recommendation_rules")
    .select("id", { count: "exact", head: true })
    .eq("skill_area_id", id);
  if ((ruleCount ?? 0) > 0) throw new Error("This skill area is used by a recommendation rule. Remove that first.");

  const { data: assessments } = await admin.from("assessments").select("items");
  const inUseByItem = (assessments ?? []).some((a) => a.items.some((item) => item.skillAreaKey === key));
  if (inUseByItem) throw new Error("This skill area is used by an assessment item. Remove that first.");

  const { error } = await admin.from("skill_areas").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/content");
}
