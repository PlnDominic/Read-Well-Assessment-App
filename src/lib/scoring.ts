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
 * The rubric here is intentionally simple — percent of items correct per
 * skill area — because the sample assessment has one item per skill area.
 * A grade-level content update with multiple items per skill area works
 * unchanged: this aggregates across however many items share a
 * skillAreaKey.
 */
export async function scoreSession(admin: AdminClient, sessionId: string): Promise<SkillScore[]> {
  const { data: session, error: sessionError } = await admin
    .from("assessment_sessions")
    .select("id, assessment_id")
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

  const items = assessment.items as AssessmentItem[];
  const correctByItemId = new Map(responses.map((r) => [r.item_id, r.is_correct === true]));

  const results = aggregateSkillScores(items, correctByItemId, skillAreaIdByKey);

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
 * area, flagged when below FLAGGED_SCORE_THRESHOLD. Items whose
 * skillAreaKey has no matching row in skillAreaIdByKey are skipped rather
 * than failing the whole session (reference data drift shouldn't block
 * scoring the items that do resolve).
 */
export function aggregateSkillScores(
  items: AssessmentItem[],
  correctByItemId: Map<string, boolean>,
  skillAreaIdByKey: Map<string, string>
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
    results.push({ skillAreaId, skillAreaKey, score, flagged: score < FLAGGED_SCORE_THRESHOLD });
  }
  return results;
}

/**
 * Matches the original prototype's mock reports: a single moderate flag
 * (e.g. Amara's fluency score) still reads as "On Track"; multiple flagged
 * areas (e.g. Diego's four) reads as "Needs Support".
 */
export function computeOverallLabel(flaggedCount: number): "On Track" | "Needs Support" {
  return flaggedCount >= 2 ? "Needs Support" : "On Track";
}
