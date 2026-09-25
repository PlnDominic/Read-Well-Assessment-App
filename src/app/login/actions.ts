"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

const MAX_ATTEMPTS_PER_EMAIL = 5;
// Schools often put many staff behind one shared IP, so this stays looser
// than the per-email limit -- it's a backstop against one client hammering
// many different accounts, not a per-person limit.
const MAX_ATTEMPTS_PER_IP = 20;

const TOO_MANY_ATTEMPTS = "Too many sign-in attempts. Wait 15 minutes and try again.";

export async function signInWithPassword(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const ip = await clientIp();
  // Both calls need to run (each records its own attempt), so this isn't
  // short-circuited with ||.
  const limited = (
    await Promise.all([
      isRateLimited(`ip:${ip}`, MAX_ATTEMPTS_PER_IP),
      isRateLimited(`email:${email.toLowerCase()}`, MAX_ATTEMPTS_PER_EMAIL),
    ])
  ).some(Boolean);
  if (limited) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "That email/password combination wasn't recognized." };
  }

  redirect("/");
}
