"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStudentReport } from "@/lib/reports";

/**
 * Manual retry for a failed/stuck PDF (TRD §7: "catch failed report
 * generation before a teacher notices" — this is the fix-it-yourself
 * counterpart). Runs synchronously (unlike the automatic post-completion
 * path, which uses after()) since a deliberate button click can reasonably
 * wait a few seconds for the render.
 */
export async function retryStudentReport(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Missing session id");

  // RLS-scoped read confirms the caller can actually access this report.
  const { data: report, error } = await supabase
    .from("student_reports")
    .select("id")
    .eq("session_id", sessionId)
    .single();
  if (error || !report) throw new Error("Report not found or not accessible");

  const admin = createAdminClient();
  await admin.from("student_reports").update({ status: "pending" }).eq("session_id", sessionId);

  try {
    await generateStudentReport(sessionId);
  } catch (err) {
    await admin.from("student_reports").update({ status: "failed" }).eq("session_id", sessionId);
    throw err;
  }

  revalidatePath("/teacher", "layout");
}
