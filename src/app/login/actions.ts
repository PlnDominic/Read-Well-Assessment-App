"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientIp, isBlocked, recordFailure } from "@/lib/rateLimit";

// Only failed sign-ins count, so signing in on several devices, or a whole
// staff room signing in at the start of the day behind one shared IP, never
// locks anyone out. The IP limit is looser than the per-email one: it's a
// backstop against one client trying many accounts, not a per-person limit.
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 40;

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
  const emailKey = `email:${email.toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  const limited = (await Promise.all([isBlocked(ipKey, MAX_FAILURES_PER_IP), isBlocked(emailKey, MAX_FAILURES_PER_EMAIL)])).some(Boolean);
  if (limited) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await Promise.all([recordFailure(ipKey), recordFailure(emailKey)]);
    return { error: "That email/password combination wasn't recognized." };
  }

  redirect("/");
}
