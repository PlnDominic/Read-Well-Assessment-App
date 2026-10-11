import "server-only";
import { randomInt } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AssessmentItem } from "@/lib/database.types";
import type { AssessmentForm } from "@/lib/levels";
import { isAssessorLed } from "@/lib/readwell/form";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Lowercase, strip punctuation, collapse whitespace, for comparing a
 * spoken-word transcript against an item's expected text without being
 * thrown off by case, a trailing period Chrome sometimes adds, etc. */
export function normalizeSpokenText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

/** What the game sends when a child skips a read-aloud item they can't read. */
export const SKIPPED = "skipped";

/**
 * Evaluates a single response against its item definition.
 *
 * Fluency (mic) items are scored by comparing the browser's Web Speech API
 * transcript (see StudentAssessmentRunner.tsx, Chrome/Edge only, no
 * backend/API key needed) against `item.expectedText`. Two graceful
 * fallbacks preserve the original "any attempt counts" behavior where real
 * scoring isn't possible: the literal sentinel "attempted" (sent by
 * browsers without SpeechRecognition support), and mic items with no
 * expectedText configured (content authored before this existed, or where
 * the program team didn't set a rubric). The match is a lenient substring
 * check, not exact equality; early readers' transcripts are noisy, and a
 * false "wrong" is a worse failure mode here than a false "right".
 */
export function evaluateResponse(item: AssessmentItem, answer: unknown): boolean {
  if (item.type === "text") {
    if (typeof answer !== "string" || answer.trim().length === 0) return false;
    if (!item.expectedText) return true;
    return normalizeSpokenText(answer) === normalizeSpokenText(item.expectedText);
  }
  if (item.type === "mic") {
    if (typeof answer !== "string" || answer.length === 0) return false;
    // The child tapped "skip" instead of reading.
    if (answer === SKIPPED) return false;
    if (answer === "attempted") return true;
    if (!item.expectedText) return true;
    const spoken = normalizeSpokenText(answer);
    const expected = normalizeSpokenText(item.expectedText);
    return expected.length > 0 && spoken.includes(expected);
  }
  if (item.type === "choice") {
    const chosen = item.options?.find((o) => o.text === answer);
    return chosen?.isCorrect ?? false;
  }
  return false;
}

// Lives with the other game-item rules, so the admin's preview can use it too.
export { itemGivesFeedback } from "@/lib/gameItems";

export function normalizeSessionCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** The code is the only thing standing between an unauthenticated caller
 * and a student's assessment, so it comes from the CSPRNG (randomInt), not
 * Math.random, whose output is predictable from earlier output. */
export function generateSessionCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}

export async function loadSessionForKiosk(admin: AdminClient, sessionId: string) {
  const { data: session, error } = await admin
    .from("assessment_sessions")
    .select("id, status, current_item_index, assessment_id, student_id, session_code, assessments(level, form, version, show_feedback)")
    .eq("id", sessionId)
    .single();
  if (error || !session) return null;

  const { data: assessment } = await admin
    .from("assessments")
    .select("items")
    .eq("id", session.assessment_id)
    .single();
  if (!assessment) return null;

  const { data: responses } = await admin
    .from("responses")
    .select("item_id, answer")
    .eq("session_id", sessionId);

  const { data: student } = await admin
    .from("students")
    .select("name")
    .eq("id", session.student_id)
    .single();

  const assessmentMeta = session.assessments as unknown as { level: number; form: AssessmentForm | null; version: number; show_feedback: boolean } | null;
  const items = assessment.items as AssessmentItem[];
  return {
    session,
    assessment: assessmentMeta ?? { level: 0, form: null, version: 0, show_feedback: true },
    items,
    responses: responses ?? [],
    studentName: student?.name ?? "Student",
    /** Given on the assessor screen by a signed-in adult; the kiosk refuses these. */
    assessorLed: isAssessorLed(items),
  };
}
