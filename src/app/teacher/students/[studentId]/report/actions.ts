"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSchoolReport, generateStudentReport, markSchoolReportFailed, markStudentReportFailed } from "@/lib/reports";
import { scoreSession } from "@/lib/scoring";
import { applyReview, parseReviewVerdict } from "@/lib/review";
import type { AssessmentItem } from "@/lib/database.types";

/**
 * Manual retry for a failed/stuck PDF (TRD §7: "catch failed report
 * generation before a teacher notices"; this is the fix-it-yourself
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
    await markStudentReportFailed(admin, sessionId, err);
    throw err;
  }

  revalidatePath("/teacher", "layout");
}

/**
 * Teacher review of an automatically scored read-aloud answer (see
 * supabase/migrations/0012_response_review.sql): marks it correct or
 * incorrect, or resets it to the automatic score, then re-scores the
 * session so the skill breakdown, flags, and recommendations on the page
 * reflect the change right away. The PDF and the school-wide report are
 * re-rendered via after() since they aren't needed for the redirect back.
 *
 * Only the student's teacher or a school administrator may review;
 * reading specialists can view this page but stay read-only.
 */
export async function reviewSpokenAnswer(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const sessionId = String(formData.get("sessionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const verdict = parseReviewVerdict(formData.get("verdict"));
  if (!sessionId || !itemId || !verdict) throw new Error("Invalid review");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "teacher" && profile.role !== "administrator")) {
    throw new Error("Only the student's teacher or an administrator can review answers");
  }

  // RLS-scoped read: can_access_session() limits a teacher to their own
  // students and an administrator to their own school.
  const { data: session } = await supabase
    .from("assessment_sessions")
    .select("id, status, student_id, cycle_id, assessment_id")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found or not accessible");
  if (session.status !== "completed") throw new Error("Only completed assessments can be reviewed");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("items")
    .eq("id", session.assessment_id)
    .single();
  const item = ((assessment?.items ?? []) as AssessmentItem[]).find((i) => i.id === itemId);
  if (!item || item.type !== "mic") throw new Error("Only read-aloud answers can be reviewed");

  const admin = createAdminClient();
  const { data: response } = await admin
    .from("responses")
    .select("is_correct, auto_is_correct, reviewed_at")
    .eq("session_id", sessionId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (!response) throw new Error("This question wasn't answered");

  const update = applyReview(response, verdict, user.id);
  const { error: updateError } = await admin
    .from("responses")
    .update(update)
    .eq("session_id", sessionId)
    .eq("item_id", itemId);
  if (updateError) throw updateError;

  await scoreSession(admin, sessionId);
  await admin.from("student_reports").update({ status: "pending" }).eq("session_id", sessionId);

  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "response.review",
    resource_type: "student_report",
    resource_id: sessionId,
    metadata: { item_id: itemId, verdict, auto_is_correct: update.auto_is_correct, is_correct: update.is_correct },
  });

  const { data: student } = await admin.from("students").select("school_id").eq("id", session.student_id).single();

  after(async () => {
    try {
      await generateStudentReport(sessionId, { notify: false });
    } catch (err) {
      console.error(`generateStudentReport failed after review of session ${sessionId}`, err);
      await markStudentReportFailed(admin, sessionId, err);
    }

    if (student?.school_id) {
      try {
        await generateSchoolReport(student.school_id, session.cycle_id);
      } catch (err) {
        console.error(`generateSchoolReport failed for school ${student.school_id}`, err);
        await markSchoolReportFailed(admin, student.school_id, session.cycle_id, err);
      }
    }
  });

  revalidatePath("/teacher", "layout");
  revalidatePath("/specialist");
  revalidatePath("/admin");
}
