import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { FLAGGED_SCORE_THRESHOLD } from "@/lib/theme";
import type { AssessmentItem } from "@/lib/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface SkillScore {
  skillAreaId: string;
  skillAreaKey: string;
  score: number;
  flagged: boolean;
}

/**
 * Scoring Service (TRD §4.2): scores every response for a completed
 * session against the grade-level rubric, writes Result rows per skill
 * area, and flags areas below FLAGGED_SCORE_THRESHOLD.
 *
 * The rubric here is intentionally simple, percent of items correct per
 * skill area, because the sample assessment has one item per skill area.
 * A grade-level content update with multiple items per skill area works
 * unchanged: this aggregates across however many items share a
 * skillAreaKey.
 */
export async function scoreSession(admin: AdminClient, sessionId: string): Promise<SkillScore[]> {
  const { data: session, error: sessionError } = await admin
    .from("assessment_sessions")
    .select("id, assessment_id, student_id")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) throw new Error(`Session ${sessionId} not found`);

  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("items")
    .eq("id", session.assessment_id)
    .single();
  if (assessmentError || !assessment) throw new Error(`Assessment for session ${sessionId} not found`);

  const { data: responses, error: responsesError } = await admin
    .from("responses")
    .select("item_id, is_correct")
    .eq("session_id", sessionId);
  if (responsesError) throw responsesError;

  const { data: skillAreas, error: skillAreasError } = await admin
    .from("skill_areas")
    .select("id, key");
  if (skillAreasError) throw skillAreasError;
  const skillAreaIdByKey = new Map(skillAreas.map((s) => [s.key, s.id]));

  const { data: student } = await admin.from("students").select("school_id").eq("id", session.student_id).single();
  const { data: weightRows } = student
    ? await admin.from("school_skill_weights").select("skill_area_id, flagged_threshold").eq("school_id", student.school_id)
    : { data: [] };
  const thresholdBySkillAreaId = new Map(
    (weightRows ?? [])
      .filter((w): w is typeof w & { flagged_threshold: number } => w.flagged_threshold != null)
      .map((w) => [w.skill_area_id, w.flagged_threshold])
  );

  const items = assessment.items as AssessmentItem[];
  const correctByItemId = new Map(responses.map((r) => [r.item_id, r.is_correct === true]));

  const results = aggregateSkillScores(items, correctByItemId, skillAreaIdByKey, thresholdBySkillAreaId);

  const { error: upsertError } = await admin.from("results").upsert(
    results.map((r) => ({
      session_id: sessionId,
      skill_area_id: r.skillAreaId,
      score: r.score,
      flagged_as_difficulty: r.flagged,
    })),
    { onConflict: "session_id,skill_area_id" }
  );
  if (upsertError) throw upsertError;

  return results;
}

/**
 * Pure aggregation step of the Scoring Service, pulled out of scoreSession
 * so it's testable without a Supabase client: percent-correct per skill
 * area, flagged when below the flagging threshold. Items whose
 * skillAreaKey has no matching row in skillAreaIdByKey are skipped rather
 * than failing the whole session (reference data drift shouldn't block
 * scoring the items that do resolve).
 *
 * thresholdBySkillAreaId lets a school override FLAGGED_SCORE_THRESHOLD for
 * a specific skill area (supabase/migrations/0011_school_skill_weights.sql,
 * admin/content's weighting UI); a skill area absent from the map uses the
 * global default.
 */
export function aggregateSkillScores(
  items: AssessmentItem[],
  correctByItemId: Map<string, boolean>,
  skillAreaIdByKey: Map<string, string>,
  thresholdBySkillAreaId: Map<string, number> = new Map()
): SkillScore[] {
  const totalsBySkill = new Map<string, { correct: number; total: number }>();
  for (const item of items) {
    const bucket = totalsBySkill.get(item.skillAreaKey) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (correctByItemId.get(item.id)) bucket.correct += 1;
    totalsBySkill.set(item.skillAreaKey, bucket);
  }

  const results: SkillScore[] = [];
  for (const [skillAreaKey, { correct, total }] of totalsBySkill) {
    const skillAreaId = skillAreaIdByKey.get(skillAreaKey);
    if (!skillAreaId) continue;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const threshold = thresholdBySkillAreaId.get(skillAreaId) ?? FLAGGED_SCORE_THRESHOLD;
    results.push({ skillAreaId, skillAreaKey, score, flagged: score < threshold });
  }
  return results;
}

/**
 * Weighted mean of a set of skill-area scores, using each school's
 * configured weight (default 1 for any skill area without an override).
 * Used for the "Avg. Overall Score" on the admin dashboard and the
 * school-wide PDF, so a school that, say, doubles the weight on Fluency
 * sees that reflected in the one number meant to summarize a cycle.
 */
export function computeWeightedAverage(
  scores: { score: number; skillAreaId: string }[],
  weightBySkillAreaId: Map<string, number> = new Map()
): number {
  if (scores.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of scores) {
    const weight = weightBySkillAreaId.get(s.skillAreaId) ?? 1;
    weightedSum += s.score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/**
 * Matches the original prototype's mock reports: a single moderate flag
 * (e.g. Amara's fluency score) still reads as "On Track"; multiple flagged
 * areas (e.g. Diego's four) reads as "Needs Support".
 */
export function computeOverallLabel(flaggedCount: number): "On Track" | "Needs Support" {
  return flaggedCount >= 2 ? "Needs Support" : "On Track";
}
