"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSessionCode } from "@/lib/kiosk";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

// This is the app's only unauthenticated lookup by a short, guessable code
// (6 chars from a 32-char alphabet); without a limit here a script could
// sweep the code space with no auth to stop it. Looser than the login
// limits since one shared classroom device legitimately mistypes a code
// a few times in a row.
const MAX_ATTEMPTS_PER_IP = 15;
const TOO_MANY_ATTEMPTS = "Too many tries. Ask your teacher for help, or wait 15 minutes.";

export async function redeemSessionCode(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const rawCode = String(formData.get("code") ?? "");
  const code = normalizeSessionCode(rawCode);
  if (!code) return { error: "Enter the code your teacher gave you." };

  const ip = await clientIp();
  if (await isRateLimited(`join-ip:${ip}`, MAX_ATTEMPTS_PER_IP)) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from("assessment_sessions")
    .select("id, status")
    .eq("session_code", code)
    .single();

  if (error || !session) {
    return { error: "That code wasn't found. Ask your teacher to check it." };
  }
  if (session.status === "completed") {
    return { error: "This assessment is already finished. Tell your teacher!" };
  }

  redirect(`/student/session/${session.id}`);
}
