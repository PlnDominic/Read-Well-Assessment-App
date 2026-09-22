"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface ForgotPasswordState {
  submitted: boolean;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { submitted: false };

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
