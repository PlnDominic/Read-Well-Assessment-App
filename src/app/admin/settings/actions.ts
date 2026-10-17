"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Switches AI-drafted summaries on or off for the school (0022, 0023). On
 * means staff can ask for a draft, which sends the assessment's scores and
 * the child's answers (or, for the school or a class, the cycle's totals),
 * with no name or other identifying detail, to the configured AI service for
 * a person to review.
 */
export async function updateAiReports(formData: FormData) {
  const { profile } = await requireAdmin();
  const enabled = formData.get("aiReportsEnabled") === "on";

  const admin = createAdminClient();
  const { error } = await admin.from("schools").update({ ai_reports_enabled: enabled }).eq("id", profile.school_id);
  if (error) throw new Error(error.message);

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "settings.ai_reports_updated",
    resource_type: "school",
    resource_id: profile.school_id,
    metadata: { enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/teacher", "layout");
}

export async function updateDataRetention(formData: FormData) {
  const { profile } = await requireAdmin();

  const raw = String(formData.get("dataRetentionDays") ?? "").trim();
  const dataRetentionDays = raw === "" ? null : Number(raw);
  if (dataRetentionDays !== null && (!Number.isInteger(dataRetentionDays) || dataRetentionDays <= 0)) {
    throw new Error("Retention period must be a positive whole number of days");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("schools")
    .update({ data_retention_days: dataRetentionDays })
    .eq("id", profile.school_id);
  if (error) throw new Error(error.message);

  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "settings.data_retention_updated",
    resource_type: "school",
    resource_id: profile.school_id,
    metadata: { dataRetentionDays },
  });

  revalidatePath("/admin/settings");
}
