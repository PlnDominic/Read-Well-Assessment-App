import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AssessmentItem, Database, SessionStatus } from "@/lib/database.types";
import { isAssessorLed, isScoredItem, itemMaxScore, storyWordCounts, type FormDef } from "./form";
import { formForItems } from "./forms";
import type { Answers } from "./flow";

/**
 * Server side of the assessor screen. Authorization is the caller's own
 * RLS-scoped reads: a teacher sees only their own students' sessions, an
 * administrator their school's (can_access_student in 0002_rls.sql). Only
 * after those reads succeed does a route write, with the service role,
 * since responses has no client-facing write policy.
 */

export type AssessorRole = "teacher" | "administrator";

/** The signed-in staff member, if they may give assessments (reading specialists are read-only). */
export async function requireAssessor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
  if (!profile || (profile.role !== "teacher" && profile.role !== "administrator")) return null;
  return { supabase, profile: profile as { id: string; role: AssessorRole } };
}

export interface AssessorSession {
  id: string;
  status: SessionStatus;
  studentId: string;
  studentName: string;
  studentGrade: number;
  items: AssessmentItem[];
  form: FormDef;
  answers: Answers;
}

/** Loads an assessor-led session the caller can access; null if it doesn't exist, isn't theirs, or isn't assessor-led. */
export async function loadAssessorSession(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<AssessorSession | null> {
  const { data: session } = await supabase
    .from("assessment_sessions")
    .select("id, status, student_id, assessment_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const { data: assessment } = await supabase.from("assessments").select("items").eq("id", session.assessment_id).single();
  const items = (assessment?.items ?? []) as AssessmentItem[];
  if (!isAssessorLed(items)) return null;
  const form = formForItems(items);
  if (!form) return null;

  const { data: student } = await supabase.from("students").select("name, grade").eq("id", session.student_id).maybeSingle();
  const { data: responses } = await supabase.from("responses").select("item_id, answer").eq("session_id", sessionId);

  return {
    id: session.id,
    status: session.status,
    studentId: session.student_id,
    studentName: student?.name ?? "Student",
    studentGrade: student?.grade ?? form.gradeLevel,
    items,
    form,
    answers: Object.fromEntries((responses ?? []).map((r) => [r.item_id, r.answer])),
  };
}

/** Why `value` isn't a valid mark for `item`, or null if it is. `null` clears a mark and is always valid. */
export function invalidAnswerReason(form: FormDef, item: AssessmentItem, value: unknown): string | null {
  if (value === null) return null;
  if (isScoredItem(item)) {
    const max = itemMaxScore(item);
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max
      ? null
      : `${item.id} takes a whole number from 0 to ${max}`;
  }
  if (item.responseChoices) {
    return item.responseChoices.some((c) => c.value === value) ? null : `${item.id} takes one of its listed answers`;
  }
  // The story reading record.
  const words = storyWordCounts(form.story.lines).reduce((a, b) => a + b, 0);
  const r = value as Record<string, unknown>;
  const isWordIndex = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < words;
  if (
    !r ||
    typeof r !== "object" ||
    !Array.isArray(r.errorWords) ||
    r.errorWords.length > words ||
    !r.errorWords.every(isWordIndex) ||
    new Set(r.errorWords).size !== r.errorWords.length ||
    !(r.lastWord === -1 || isWordIndex(r.lastWord)) ||
    !Number.isInteger(r.seconds) ||
    (r.seconds as number) < 0 ||
    (r.seconds as number) > 120 ||
    Object.keys(r).some((k) => !["errorWords", "lastWord", "seconds"].includes(k))
  ) {
    return `${item.id} takes errorWords, lastWord and seconds (0-120)`;
  }
  return null;
}

/** responses.is_correct for a mark: full marks on a scored item; null for unscored items. */
export function isCorrectFor(item: AssessmentItem, value: unknown): boolean | null {
  if (!isScoredItem(item)) return null;
  return typeof value === "number" && value >= itemMaxScore(item);
}

/**
 * Validates and stores a batch of marks for one session. `parts` limits
 * which parts this caller may mark (the assessor screen marks Parts 1-12;
 * the writing sheet, Part 13, is entered from the report page). Returns an
 * error message, or null once everything is saved. `admin` is the
 * service-role client; call this only after loadAssessorSession has
 * confirmed the caller can access the session.
 */
export async function saveMarks(
  admin: SupabaseClient<Database>,
  session: Pick<AssessorSession, "id" | "form">,
  marks: Record<string, unknown>,
  parts: number[]
): Promise<string | null> {
  const itemById = new Map(session.form.items.map((i) => [i.id, i]));
  const entries = Object.entries(marks);
  if (entries.length === 0) return null;
  if (entries.length > session.form.items.length) return "Too many marks in one request";

  for (const [itemId, value] of entries) {
    const item = itemById.get(itemId);
    if (!item || !parts.includes(item.part ?? 0)) return `Unknown item ${itemId}`;
    const reason = invalidAnswerReason(session.form, item, value);
    if (reason) return reason;
  }

  const toUpsert = entries
    .filter(([, value]) => value !== null)
    .map(([itemId, value]) => ({
      session_id: session.id,
      item_id: itemId,
      answer: value,
      is_correct: isCorrectFor(itemById.get(itemId)!, value),
    }));
  const toClear = entries.filter(([, value]) => value === null).map(([itemId]) => itemId);

  if (toUpsert.length > 0) {
    const { error } = await admin.from("responses").upsert(toUpsert, { onConflict: "session_id,item_id" });
    if (error) return error.message;
  }
  if (toClear.length > 0) {
    const { error } = await admin.from("responses").delete().eq("session_id", session.id).in("item_id", toClear);
    if (error) return error.message;
  }
  return null;
}
