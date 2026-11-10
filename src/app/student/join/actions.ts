"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSessionCode } from "@/lib/kiosk";
import { clientIp, isBlocked, recordFailure } from "@/lib/rateLimit";
import { isAssessorLed } from "@/lib/readwell/form";
import type { AssessmentItem } from "@/lib/database.types";

// This is the app's only unauthenticated lookup by a short code (6 chars
// from a 32-char alphabet), so a script could sweep the code space with no
// auth to stop it. Only FAILED lookups count: a whole school's children
// share one public IP and every one of them joins successfully, so counting
// successes would lock the 16th child out. A class that mistypes a lot
// still has plenty of room; a sweep (about a billion codes) never gets far.
const MAX_FAILURES_PER_IP = 150;
const TOO_MANY_ATTEMPTS = "Too many tries. Ask your teacher for help, or wait 15 minutes.";

export async function redeemSessionCode(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const rawCode = String(formData.get("code") ?? "");
  const code = normalizeSessionCode(rawCode);
  if (!code) return { error: "Enter the code your teacher gave you." };

  const ip = await clientIp();
  if (await isBlocked(`join-ip:${ip}`, MAX_FAILURES_PER_IP)) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from("assessment_sessions")
    .select("id, status, assessments(items)")
    .eq("session_code", code)
    .single();

  if (error || !session) {
    await recordFailure(`join-ip:${ip}`);
    return { error: "That code wasn't found. Ask your teacher to check it." };
  }
  if (session.status === "completed") {
    return { error: "This assessment is already finished. Tell your teacher!" };
  }
  const items = (session as unknown as { assessments: { items: AssessmentItem[] } | null }).assessments?.items ?? [];
  if (isAssessorLed(items)) {
    return { error: "Your teacher will do this one with you. Ask your teacher!" };
  }

  redirect(`/student/session/${session.id}`);
}
