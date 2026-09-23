import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AssessmentItem, Database } from "@/lib/database.types";

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
  if (item.type === "mic") {
    if (typeof answer !== "string" || answer.length === 0) return false;
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

export function normalizeSessionCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function generateSessionCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export type CreateSessionResult =
  | { ok: true; id: string; sessionCode: string }
  | { ok: false; reason: "no_cycle" | "no_assessment" };

/**
 * Creates a fresh not-yet-started session (and its kiosk code) for a
 * student, against the school's current cycle and the active assessment
 * for their grade. Shared by the "add a student" flows (so a code exists
 * the moment a student is added, since most students are on a different device
 * than the staff member adding them) and by startOrResumeAssessment (which
 * additionally checks for a non-completed session to resume first, so a
 * student can be re-run through a fresh assessment once their prior one
 * in this cycle is complete rather than being stuck on "View Report").
 *
 * Returns `ok: false` rather than throwing when there's no active cycle or
 * no active assessment for the grade yet; those are normal, fixable setup
 * gaps (visit /admin/cycles or /admin/content), not really errors, and the
 * student should still get added to the roster either way.
 */
export async function createSessionForStudent(
  supabase: SupabaseClient<Database>,
  params: { studentId: string; schoolId: string; grade: number; createdBy: string }
): Promise<CreateSessionResult> {
  const { data: cycle } = await supabase
    .from("assessment_cycles")
    .select("id")
    .eq("school_id", params.schoolId)
    .eq("is_current", true)
    .maybeSingle();
  if (!cycle) return { ok: false, reason: "no_cycle" };

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id")
    .eq("grade_level", params.grade)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!assessment) return { ok: false, reason: "no_assessment" };

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomUUID();
    const sessionCode = generateSessionCode();
    // Deliberately not chaining .select() here (which asks PostgREST for the
    // row back via RETURNING): under this project's Postgres, an INSERT ...
    // RETURNING can fail RLS even though the exact same row is immediately
    // selectable via a separate, ordinary SELECT through the same policy;
    // verified directly in the SQL editor. Generating the id ourselves means
    // we never need the row back, sidestepping that entirely.
    const { error } = await supabase.from("assessment_sessions").insert({
      id,
      student_id: params.studentId,
      assessment_id: assessment.id,
      cycle_id: cycle.id,
      session_code: sessionCode,
      created_by: params.createdBy,
    });
    if (!error) return { ok: true, id, sessionCode };
    if (!error.message.includes("session_code")) throw error;
  }
  throw new Error("Could not allocate a session code. Try again.");
}

export async function loadSessionForKiosk(admin: AdminClient, sessionId: string) {
  const { data: session, error } = await admin
    .from("assessment_sessions")
    .select("id, status, current_item_index, assessment_id, student_id, session_code")
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

  return {
    session,
    items: assessment.items as AssessmentItem[],
    responses: responses ?? [],
    studentName: student?.name ?? "Student",
  };
}
