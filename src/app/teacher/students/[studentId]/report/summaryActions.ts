"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRateLimited } from "@/lib/rateLimit";
import { generateStudentReport, markStudentReportFailed } from "@/lib/reports";
import { fillName, firstNameOf, linesToList, linesToTitled, parseSummary } from "@/lib/aiSummary";
import { aiConfigured, collectSummaryFacts, draftSummary, SummaryError } from "@/lib/aiSummaryServer";

/**
 * The AI-drafted summary on a student's report (0022). The scores and bands
 * never come from the model; it only drafts the write-up beside them, which
 * a teacher edits and approves before it reaches the PDF. Every action is
 * for the student's own teacher or a school administrator (the session read
 * is RLS-scoped, like reviewSpokenAnswer), never a reading specialist.
 */

/** What a form shows after one of these actions. */
export type SummaryActionResult = { ok: true } | { ok: false; message: string };

const fail = (message: string): SummaryActionResult => ({ ok: false, message });

/** Confirms the caller may work on this session's summary; returns what the actions need. */
async function authorize(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
  if (!profile || (profile.role !== "teacher" && profile.role !== "administrator")) {
    throw new Error("Only the student's teacher or an administrator can work on a summary");
  }
  const { data: session } = await supabase
    .from("assessment_sessions")
    .select("id, status, student_id, cycle_id")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Report not found or not accessible");
  if (session.status !== "completed") throw new Error("The assessment isn't finished yet");

  const admin = createAdminClient();
  const { data: student } = await admin.from("students").select("name, school_id").eq("id", session.student_id).single();
  if (!student) throw new Error("Student not found");
  const { data: school } = await admin.from("schools").select("ai_reports_enabled").eq("id", student.school_id).single();
  return { admin, profile, session, student, aiEnabled: Boolean(school?.ai_reports_enabled) };
}

/** Writes a new draft, replacing any summary this assessment already has. */
export async function generateSummary(formData: FormData): Promise<SummaryActionResult> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return fail("Missing session id");
  const { admin, profile, session, student, aiEnabled } = await authorize(sessionId);

  if (!aiEnabled) return fail("AI summaries are switched off for your school. An administrator can turn them on in Settings.");
  if (!aiConfigured()) return fail("AI summaries aren't set up on this deployment yet. An administrator needs to add the AI settings (see .env.example).");
  // Each draft costs money; 20 per person per 15 minutes is far more than a teacher needs.
  if (await isRateLimited(`ai-summary:${profile.id}`, 20)) return fail("That's a lot of summaries at once. Try again in a few minutes.");

  try {
    const facts = await collectSummaryFacts(admin, sessionId);
    const { content, model } = await draftSummary(facts);
    const named = fillName(content, firstNameOf(student.name));
    const { error } = await admin.from("student_report_summaries").upsert(
      {
        student_id: session.student_id,
        session_id: sessionId,
        status: "draft",
        content: named,
        model,
        edited: false,
        generated_by: profile.id,
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );
    if (error) return fail("The summary was written but couldn't be saved. Try again.");
    // No names, ids or answers are logged: who drafted it, and with which model.
    await admin.from("audit_log").insert({
      actor_id: profile.id,
      action: "summary.drafted",
      resource_type: "student_report",
      resource_id: sessionId,
      metadata: { model },
    });
  } catch (err) {
    if (err instanceof SummaryError) return fail(err.message);
    console.error("generateSummary failed", err);
    return fail("The summary couldn't be written just now. Try again.");
  }

  revalidatePath("/teacher", "layout");
  return { ok: true };
}

/** Saves a teacher's edits to a draft (or to an approved summary, which goes back to draft). */
export async function saveSummary(formData: FormData): Promise<SummaryActionResult> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return fail("Missing session id");
  const { admin, profile } = await authorize(sessionId);

  const content = parseSummary({
    headline: formData.get("headline"),
    overview: formData.get("overview"),
    canDo: linesToList(String(formData.get("canDo") ?? "")),
    notYet: linesToList(String(formData.get("notYet") ?? "")),
    firstThings: linesToTitled(String(formData.get("firstThings") ?? "")),
    atSchool: linesToList(String(formData.get("atSchool") ?? "")),
    atHome: linesToTitled(String(formData.get("atHome") ?? "")),
  });
  if (!content) return fail("Check the summary: every box needs something, the priorities and home activities need a title, then a colon, then the text, and each point should be short.");

  const { error } = await admin
    .from("student_report_summaries")
    .update({ content, edited: true, status: "draft", approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
  if (error) return fail("Couldn't save your changes. Try again.");

  await admin.from("audit_log").insert({ actor_id: profile.id, action: "summary.edited", resource_type: "student_report", resource_id: sessionId });
  revalidatePath("/teacher", "layout");
  return { ok: true };
}

/** Approves the summary so it appears on the PDF, and re-renders the PDF. */
export async function approveSummary(formData: FormData): Promise<SummaryActionResult> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return fail("Missing session id");
  const { admin, profile } = await authorize(sessionId);

  const { data, error } = await admin
    .from("student_report_summaries")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .select("id");
  if (error || !data?.length) return fail("There's no summary to approve.");

  await admin.from("audit_log").insert({ actor_id: profile.id, action: "summary.approved", resource_type: "student_report", resource_id: sessionId });
  await rerenderPdf(admin, sessionId);
  revalidatePath("/teacher", "layout");
  return { ok: true };
}

/** Removes the summary; the report goes back to scores and recommendations only. */
export async function discardSummary(formData: FormData): Promise<SummaryActionResult> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return fail("Missing session id");
  const { admin, profile } = await authorize(sessionId);

  const { data: existing } = await admin.from("student_report_summaries").select("status").eq("session_id", sessionId).maybeSingle();
  const { error } = await admin.from("student_report_summaries").delete().eq("session_id", sessionId);
  if (error) return fail("Couldn't remove the summary. Try again.");

  await admin.from("audit_log").insert({ actor_id: profile.id, action: "summary.discarded", resource_type: "student_report", resource_id: sessionId });
  if (existing?.status === "approved") await rerenderPdf(admin, sessionId);
  revalidatePath("/teacher", "layout");
  return { ok: true };
}

/** The PDF carries the approved summary, so it is rendered again after approving or discarding one. */
async function rerenderPdf(admin: ReturnType<typeof createAdminClient>, sessionId: string) {
  await admin.from("student_reports").update({ status: "pending" }).eq("session_id", sessionId);
  after(async () => {
    try {
      await generateStudentReport(sessionId, { notify: false });
    } catch (err) {
      console.error(`generateStudentReport failed after summary change for session ${sessionId}`, err);
      await markStudentReportFailed(admin, sessionId, err);
    }
  });
}
