"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

export interface ForgotPasswordState {
  submitted: boolean;
}

// Tighter than login's limits: each attempt sends an email (Supabase's own
// project-wide email quota is the backstop, but there's no reason to let
// one caller spend it repeatedly against the same or many addresses).
const MAX_ATTEMPTS_PER_EMAIL = 3;
const MAX_ATTEMPTS_PER_IP = 10;

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { submitted: false };

  const ip = await clientIp();
  const limited = (
    await Promise.all([
      isRateLimited(`reset-ip:${ip}`, MAX_ATTEMPTS_PER_IP),
      isRateLimited(`reset-email:${email.toLowerCase()}`, MAX_ATTEMPTS_PER_EMAIL),
    ])
  ).some(Boolean);
  // Same "always report success" reasoning as below: don't reveal that a
  // limit exists per-email either, since that itself would confirm the
  // address has an account.
  if (limited) return { submitted: true };

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";

  const supabase = await createClient();
  // Always report success regardless of whether the email exists, so this
  // can't be used to enumerate staff accounts.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${proto}://${host}/login/reset`,
  });

  return { submitted: true };
}
