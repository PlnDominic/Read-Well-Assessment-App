"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRateLimited } from "@/lib/rateLimit";
import { linesToList, linesToTitled } from "@/lib/aiSummary";
import { aiConfigured, SummaryError } from "@/lib/aiSummaryServer";
import { fillClassNames, parseCycleSummary } from "@/lib/cycleSummary";
import { collectCycleFacts, draftCycleSummary } from "@/lib/cycleSummaryServer";
import { generateSchoolReport, markSchoolReportFailed } from "@/lib/reports";

/**
 * The AI-drafted summary of a cycle on the admin Overview (0023), for the
 * whole school or one class. Administrators only. It is drafted from the
 * cycle's totals, never a child's answers, and only an approved school
 * summary goes in the school PDF; an approved class summary is also shown
 * to that class's teacher.
 */

export type CycleSummaryResult = { ok: true } | { ok: false; message: string };

const fail = (message: string): CycleSummaryResult => ({ ok: false, message });

type AdminClient = ReturnType<typeof createAdminClient>;

/** Confirms the caller is an administrator of the cycle's school, and that the class (if any) is at that school. */
async function authorize(formData: FormData) {
  const { profile } = await requireAdmin();
  const cycleId = String(formData.get("cycleId") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "") || null;
  if (!cycleId) throw new Error("Missing cycle id");

  const admin = createAdminClient();
  const { data: cycle } = await admin.from("assessment_cycles").select("id").eq("id", cycleId).eq("school_id", profile.school_id).maybeSingle();
  if (!cycle) throw new Error("Cycle not found");
  if (teacherId) {
    const { data: teacher } = await admin.from("profiles").select("id").eq("id", teacherId).eq("school_id", profile.school_id).maybeSingle();
    if (!teacher) throw new Error("Class not found");
  }
  return { admin, profile, cycleId, teacherId };
}

/** The summary for this cycle and scope, if there is one. */
async function findSummary(admin: AdminClient, cycleId: string, teacherId: string | null) {
  const query = admin.from("cycle_report_summaries").select("id, status").eq("cycle_id", cycleId);
  const { data } = await (teacherId ? query.eq("teacher_id", teacherId) : query.is("teacher_id", null)).maybeSingle();
  return data;
}

const audit = (admin: AdminClient, actorId: string, action: string, cycleId: string, metadata: Record<string, unknown>) =>
  admin.from("audit_log").insert({ actor_id: actorId, action, resource_type: "cycle_summary", resource_id: cycleId, metadata });

const scopeOf = (teacherId: string | null) => (teacherId ? "class" : "school");

function revalidate() {
  revalidatePath("/admin");
  revalidatePath("/teacher");
}

/** Writes a new draft, replacing any summary this cycle and scope already has. */
export async function generateCycleSummary(formData: FormData): Promise<CycleSummaryResult> {
  const { admin, profile, cycleId, teacherId } = await authorize(formData);

  const { data: school } = await admin.from("schools").select("ai_reports_enabled").eq("id", profile.school_id).single();
  if (!school?.ai_reports_enabled) return fail("AI summaries are switched off for your school. You can turn them on in Settings.");
  if (!aiConfigured()) return fail("AI summaries aren't set up on this deployment yet (see .env.example).");
  if (await isRateLimited(`ai-summary:${profile.id}`, 60)) return fail("That's a lot of summaries at once. Try again in a few minutes.");

  try {
    const collected = await collectCycleFacts(admin, { schoolId: profile.school_id, cycleId, teacherId });
    if (!collected) return fail("There are no finished assessments to summarise yet.");
    const { content, model } = await draftCycleSummary(collected.facts);
    const named = fillClassNames(content, collected.classNames);
    const existing = await findSummary(admin, cycleId, teacherId);
    const row = {
      status: "draft" as const,
      content: named,
      model,
      edited: false,
      generated_by: profile.id,
      approved_by: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await admin.from("cycle_report_summaries").update(row).eq("id", existing.id)
      : await admin.from("cycle_report_summaries").insert({ ...row, school_id: profile.school_id, cycle_id: cycleId, teacher_id: teacherId });
    if (error) return fail("The summary was written but couldn't be saved. Try again.");
    await audit(admin, profile.id, "cycle_summary.drafted", cycleId, { model, scope: scopeOf(teacherId) });
  } catch (err) {
    if (err instanceof SummaryError) return fail(err.message);
    console.error("generateCycleSummary failed", err);
    return fail("The summary couldn't be written just now. Try again.");
  }

  revalidate();
  return { ok: true };
}

/** Saves an administrator's edits; an approved summary goes back to draft. */
export async function saveCycleSummary(formData: FormData): Promise<CycleSummaryResult> {
  const { admin, profile, cycleId, teacherId } = await authorize(formData);

  const content = parseCycleSummary({
    headline: formData.get("headline"),
    overview: formData.get("overview"),
    strengths: linesToList(String(formData.get("strengths") ?? "")),
    priorities: linesToTitled(String(formData.get("priorities") ?? "")),
    actions: linesToList(String(formData.get("actions") ?? "")),
  });
  if (!content) return fail("Check the summary: every box needs something, each priority needs a title, then a colon, then the text, and each point should be short.");

  const existing = await findSummary(admin, cycleId, teacherId);
  if (!existing) return fail("There's no summary to change.");
  const { error } = await admin
    .from("cycle_report_summaries")
    .update({ content, edited: true, status: "draft", approved_by: null, approved_at: null, updated_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) return fail("Couldn't save your changes. Try again.");

  await audit(admin, profile.id, "cycle_summary.edited", cycleId, { scope: scopeOf(teacherId) });
  revalidate();
  return { ok: true };
}

/** Approves the summary: the school's goes in the school PDF, a class's is shown to its teacher. */
export async function approveCycleSummary(formData: FormData): Promise<CycleSummaryResult> {
  const { admin, profile, cycleId, teacherId } = await authorize(formData);

  const existing = await findSummary(admin, cycleId, teacherId);
  if (!existing) return fail("There's no summary to approve.");
  const { error } = await admin
    .from("cycle_report_summaries")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) return fail("Couldn't approve it. Try again.");

  await audit(admin, profile.id, "cycle_summary.approved", cycleId, { scope: scopeOf(teacherId) });
  if (!teacherId) await rerenderSchoolPdf(admin, profile.school_id, cycleId);
  revalidate();
  return { ok: true };
}

/** Removes the summary. */
export async function discardCycleSummary(formData: FormData): Promise<CycleSummaryResult> {
  const { admin, profile, cycleId, teacherId } = await authorize(formData);

  const existing = await findSummary(admin, cycleId, teacherId);
  if (!existing) return { ok: true };
  const { error } = await admin.from("cycle_report_summaries").delete().eq("id", existing.id);
  if (error) return fail("Couldn't remove the summary. Try again.");

  await audit(admin, profile.id, "cycle_summary.discarded", cycleId, { scope: scopeOf(teacherId) });
  if (!teacherId && existing.status === "approved") await rerenderSchoolPdf(admin, profile.school_id, cycleId);
  revalidate();
  return { ok: true };
}

/** The school PDF carries the approved school summary, so it's made again after approving or removing one. */
async function rerenderSchoolPdf(admin: AdminClient, schoolId: string, cycleId: string) {
  await admin.from("school_reports").update({ status: "pending" }).eq("school_id", schoolId).eq("cycle_id", cycleId);
  after(async () => {
    try {
      await generateSchoolReport(schoolId, cycleId, { notify: false });
    } catch (err) {
      console.error(`generateSchoolReport failed after summary change for cycle ${cycleId}`, err);
      await markSchoolReportFailed(admin, schoolId, cycleId, err);
    }
  });
}
