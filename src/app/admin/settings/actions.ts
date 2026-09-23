"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";

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
