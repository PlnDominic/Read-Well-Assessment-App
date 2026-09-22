import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AssessmentItem } from "@/lib/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Evaluates a single response against its item definition.
 *
 * Fluency items are a microphone "read this aloud" prompt with no real
 * speech-recognition/grading integration (out of scope of the PRD/TRD,
 * which don't specify one) — any completed attempt is scored correct,
 * matching the original prototype's simulated mic flow. A future revision
 * that wires in real oral-reading-fluency scoring would only need to
 * change this one function.
 */
export function evaluateResponse(item: AssessmentItem, answer: unknown): boolean {
  if (item.type === "mic") {
    return answer === "attempted";
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

export async function loadSessionForKiosk(admin: AdminClient, sessionId: string) {
  const { data: session, error } = await admin
    .from("assessment_sessions")
    .select("id, status, current_item_index, assessment_id, student_id")
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
