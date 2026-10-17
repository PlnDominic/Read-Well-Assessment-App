import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getRecommendations } from "@/lib/recommendations";
import { aggregateClassroomBreakdown, computeOverallLabel } from "@/lib/scoring";
import { askModel, type CallModel } from "@/lib/aiSummaryServer";
import {
  CYCLE_JSON_INSTRUCTION,
  CYCLE_SUMMARY_SCHEMA,
  CYCLE_SYSTEM_PROMPT,
  className,
  classToken,
  cycleFactsMessage,
  parseCycleSummary,
  type CycleFacts,
  type CycleSummaryContent,
} from "@/lib/cycleSummary";

type AdminClient = ReturnType<typeof createAdminClient>;

/** The flagged skill areas per level whose program recommendations the model is given. */
const TOP_FLAGGED_PER_LEVEL = 3;

/**
 * The totals for one cycle, for the whole school (teacherId null) or one
 * class, with no child's name, id or answers, and no school, teacher or
 * cycle name. Returns null when nothing in scope is finished yet. `classNames`
 * maps each class label the model may write back to the class's real name.
 */
export async function collectCycleFacts(
  admin: AdminClient,
  params: { schoolId: string; cycleId: string; teacherId: string | null }
): Promise<{ facts: CycleFacts; classNames: Record<string, string> } | null> {
  let sessionQuery = admin
    .from("assessment_sessions")
    .select("id, student_id, students!inner(school_id, teacher_id, deleted_at, profiles(name)), assessments(level)")
    .eq("cycle_id", params.cycleId)
    .eq("status", "completed")
    .eq("students.school_id", params.schoolId)
    .is("students.deleted_at", null);
  if (params.teacherId) sessionQuery = sessionQuery.eq("students.teacher_id", params.teacherId);
  const { data: sessionData, error } = await sessionQuery;
  if (error) throw error;

  type SessionRow = {
    id: string;
    student_id: string;
    students: { teacher_id: string; profiles: { name: string } | null } | null;
    assessments: { level: number } | null;
  };
  const sessions = (sessionData ?? []) as unknown as SessionRow[];
  if (sessions.length === 0) return null;
  const sessionIds = sessions.map((s) => s.id);
  const levelBySession = new Map(sessions.map((s) => [s.id, s.assessments?.level ?? 1]));

  let rollQuery = admin.from("students").select("id", { count: "exact", head: true }).eq("school_id", params.schoolId).is("deleted_at", null);
  if (params.teacherId) rollQuery = rollQuery.eq("teacher_id", params.teacherId);
  const { count: childrenOnRoll } = await rollQuery;

  const { data: resultData, error: resultsError } = await admin
    .from("results")
    .select("session_id, score, flagged_as_difficulty, skill_areas(id, name)")
    .in("session_id", sessionIds);
  if (resultsError) throw resultsError;
  type ResultRow = { session_id: string; score: number; flagged_as_difficulty: boolean; skill_areas: { id: string; name: string } };
  const results = (resultData ?? []) as unknown as ResultRow[];

  // Each report's overall result, as its PDF says it (the guide's support
  // level for an adult-given form); worked out from the flags while a
  // report is still being made.
  const { data: reports } = await admin.from("student_reports").select("session_id, overall_label").in("session_id", sessionIds);
  const labelBySession = new Map((reports ?? []).map((r) => [r.session_id, r.overall_label]));
  const flaggedBySession = new Map<string, number>();
  for (const r of results) if (r.flagged_as_difficulty) flaggedBySession.set(r.session_id, (flaggedBySession.get(r.session_id) ?? 0) + 1);
  const labelOf = (sessionId: string) => labelBySession.get(sessionId) ?? computeOverallLabel(flaggedBySession.get(sessionId) ?? 0);

  const levels = new Map<number, Map<string, number>>();
  for (const s of sessions) {
    const level = levelBySession.get(s.id)!;
    const label = labelOf(s.id);
    const counts = levels.get(level) ?? new Map<string, number>();
    counts.set(label, (counts.get(label) ?? 0) + 1);
    levels.set(level, counts);
  }

  type SkillBucket = { level: number; id: string; skill: string; total: number; scoreSum: number; flagged: number };
  const skills = new Map<string, SkillBucket>();
  for (const r of results) {
    const level = levelBySession.get(r.session_id) ?? 1;
    const key = `${level}:${r.skill_areas.id}`;
    const b = skills.get(key) ?? { level, id: r.skill_areas.id, skill: r.skill_areas.name, total: 0, scoreSum: 0, flagged: 0 };
    b.total += 1;
    b.scoreSum += r.score;
    if (r.flagged_as_difficulty) b.flagged += 1;
    skills.set(key, b);
  }
  const skillRows = [...skills.values()].sort((a, b) => a.level - b.level || b.flagged / b.total - a.flagged / a.total);

  const recommendations: CycleFacts["recommendations"] = [];
  for (const level of [...levels.keys()].sort((a, b) => a - b)) {
    const flaggedIds = skillRows.filter((s) => s.level === level && s.flagged > 0).slice(0, TOP_FLAGGED_PER_LEVEL).map((s) => s.id);
    const recs = await getRecommendations(admin, flaggedIds, level);
    recommendations.push(...recs.map((r) => ({ level, skill: r.skillAreaName, text: r.text })));
  }

  const facts: CycleFacts = {
    scope: params.teacherId ? "one class" : "the whole school",
    assessments: sessions.length,
    childrenAssessed: new Set(sessions.map((s) => s.student_id)).size,
    childrenOnRoll: childrenOnRoll ?? 0,
    levels: [...levels.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, counts]) => ({
        level,
        assessments: [...counts.values()].reduce((n, c) => n + c, 0),
        results: [...counts.entries()].map(([label, n]) => ({ label, assessments: n })),
      })),
    skills: skillRows.map((s) => ({
      level: s.level,
      skill: s.skill,
      assessments: s.total,
      averagePercent: Math.round(s.scoreSum / s.total),
      flaggedPercent: Math.round((s.flagged / s.total) * 100),
    })),
    recommendations,
  };

  const classNames: Record<string, string> = {};
  if (!params.teacherId) {
    const { data: weightRows } = await admin.from("school_skill_weights").select("skill_area_id, weight").eq("school_id", params.schoolId);
    const weights = new Map((weightRows ?? []).map((w) => [w.skill_area_id, w.weight]));
    const teacherBySession = new Map(
      sessions.filter((s) => s.students?.profiles).map((s) => [s.id, { id: s.students!.teacher_id, name: s.students!.profiles!.name }])
    );
    const classes = aggregateClassroomBreakdown(
      results.flatMap((r) => {
        const teacher = teacherBySession.get(r.session_id);
        return teacher
          ? [{ teacherId: teacher.id, teacherName: teacher.name, sessionId: r.session_id, skillAreaId: r.skill_areas.id, score: r.score, flagged: r.flagged_as_difficulty }]
          : [];
      }),
      weights
    );
    // One class tells the model nothing a whole-school summary doesn't.
    if (classes.length > 1) {
      facts.classes = classes.map((c, i) => {
        classNames[classToken(i)] = className(c.teacherName);
        return { class: classToken(i), childrenAssessed: c.studentsAssessed, averagePercent: c.avgScore, needsSupportPercent: c.pctNeedsSupport };
      });
    }
  }

  return { facts, classNames };
}

/** Asks the model for a cycle's summary. */
export function draftCycleSummary(
  facts: CycleFacts,
  call?: CallModel,
  model?: string,
  attempts?: number
): Promise<{ content: CycleSummaryContent; model: string }> {
  return askModel(
    {
      system: CYCLE_SYSTEM_PROMPT,
      user: cycleFactsMessage(facts),
      format: { schema: CYCLE_SUMMARY_SCHEMA as unknown as Record<string, unknown>, instruction: CYCLE_JSON_INSTRUCTION },
      parse: parseCycleSummary,
    },
    call,
    model,
    attempts
  );
}
