"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSessionCode } from "@/lib/kiosk";

export async function redeemSessionCode(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const rawCode = String(formData.get("code") ?? "");
  const code = normalizeSessionCode(rawCode);
  if (!code) return { error: "Enter the code your teacher gave you." };

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
