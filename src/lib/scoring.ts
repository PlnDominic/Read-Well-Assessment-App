import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { FLAGGED_SCORE_THRESHOLD } from "@/lib/theme";
import type { AssessmentItem } from "@/lib/database.types";
import { isAssessorLed, type FormDef } from "@/lib/readwell/form";
import { formForItems } from "@/lib/readwell/forms";
import { scoreForm, strandResultRows } from "@/lib/readwell/score";

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
    .select("item_id, is_correct, answer")
    .eq("session_id", sessionId);
  if (responsesError) throw responsesError;

  const { data: skillAreas, error: skillAreasError } = await admin
    .from("skill_areas")
    .select("id, key");
  if (skillAreasError) throw skillAreasError;
  const skillAreaIdByKey = new Map(skillAreas.map((s) => [s.key, s.id]));

  const items = assessment.items as AssessmentItem[];
  const form = isAssessorLed(items) ? formForItems(items) : null;
  if (form) return scoreAssessorSession(admin, sessionId, form, responses, skillAreaIdByKey);

  const { data: student } = await admin.from("students").select("school_id").eq("id", session.student_id).single();
  const { data: weightRows } = student
    ? await admin.from("school_skill_weights").select("skill_area_id, flagged_threshold").eq("school_id", student.school_id)
    : { data: [] };
  const thresholdBySkillAreaId = new Map(
    (weightRows ?? [])
      .filter((w): w is typeof w & { flagged_threshold: number } => w.flagged_threshold != null)
      .map((w) => [w.skill_area_id, w.flagged_threshold])
  );

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
 * Assessor-led forms (ReadWell Level 1) score by strand with the guide's
 * own rules instead of percent-correct per skill area: gates decide which
 * items count, and a strand is flagged when it's Emerging (see
 * lib/readwell/score.ts). One results row per strand with a score, so the
 * dashboard, school report and CSV export work unchanged; strands a gate
 * skipped (NA) or not yet entered (writing) get no row, and any row left
 * from an earlier scoring is removed.
 */
async function scoreAssessorSession(
  admin: AdminClient,
  sessionId: string,
  form: FormDef,
  responses: { item_id: string; answer: unknown }[],
  skillAreaIdByKey: Map<string, string>
): Promise<SkillScore[]> {
  const answers = Object.fromEntries(responses.map((r) => [r.item_id, r.answer]));
  const results: SkillScore[] = strandResultRows(scoreForm(form, answers)).flatMap((r) => {
    const skillAreaId = skillAreaIdByKey.get(r.key);
    return skillAreaId ? [{ skillAreaId, skillAreaKey: r.key, score: r.score, flagged: r.flagged }] : [];
  });

  const { error: deleteError } = await admin.from("results").delete().eq("session_id", sessionId);
  if (deleteError) throw deleteError;
  if (results.length > 0) {
    const { error: insertError } = await admin.from("results").insert(
      results.map((r) => ({ session_id: sessionId, skill_area_id: r.skillAreaId, score: r.score, flagged_as_difficulty: r.flagged }))
    );
    if (insertError) throw insertError;
  }
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

export interface ClassroomBreakdownRow {
  teacherId: string;
  teacherName: string;
  sessionId: string;
  skillAreaId: string;
  score: number;
  flagged: boolean;
}

export interface ClassroomSummary {
  teacherId: string;
  teacherName: string;
  studentsAssessed: number;
  avgScore: number;
  pctNeedsSupport: number;
}

/**
 * Groups a cycle's per-session, per-skill-area result rows by the
 * student's teacher, for the school-wide report's classroom breakdown
 * (PRD open question 6: "by classroom, by grade only, or both?" — this
 * app shows both). One row per (session, skill area); a session with
 * multiple skill areas contributes multiple rows, same shape the
 * school-wide skill distribution already consumes.
 *
 * avgScore is the same weighted-mean calculation as computeWeightedAverage,
 * scoped to that teacher's rows. pctNeedsSupport re-derives each session's
 * flagged-skill-area count from these rows and applies computeOverallLabel,
 * so it always agrees with the label shown on that student's own report.
 * Sorted by teacher name for a stable, readable table.
 */
export function aggregateClassroomBreakdown(
  rows: ClassroomBreakdownRow[],
  weightBySkillAreaId: Map<string, number> = new Map()
): ClassroomSummary[] {
  const byTeacher = new Map<string, { teacherName: string; rows: ClassroomBreakdownRow[]; sessionIds: Set<string> }>();
  for (const row of rows) {
    const bucket = byTeacher.get(row.teacherId) ?? {
      teacherName: row.teacherName,
      rows: [],
      sessionIds: new Set<string>(),
    };
    bucket.rows.push(row);
    bucket.sessionIds.add(row.sessionId);
    byTeacher.set(row.teacherId, bucket);
  }

  const summaries: ClassroomSummary[] = [];
  for (const [teacherId, { teacherName, rows: teacherRows, sessionIds }] of byTeacher) {
    const flaggedCountBySession = new Map<string, number>();
    for (const row of teacherRows) {
      if (!row.flagged) continue;
      flaggedCountBySession.set(row.sessionId, (flaggedCountBySession.get(row.sessionId) ?? 0) + 1);
    }
    const needsSupportCount = [...sessionIds].filter(
      (id) => computeOverallLabel(flaggedCountBySession.get(id) ?? 0) === "Needs Support"
    ).length;

    summaries.push({
      teacherId,
      teacherName,
      studentsAssessed: sessionIds.size,
      avgScore: computeWeightedAverage(
        teacherRows.map((r) => ({ score: r.score, skillAreaId: r.skillAreaId })),
        weightBySkillAreaId
      ),
      pctNeedsSupport: sessionIds.size > 0 ? Math.round((needsSupportCount / sessionIds.size) * 100) : 0,
    });
  }

  return summaries.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
}
