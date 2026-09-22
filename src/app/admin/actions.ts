"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSchoolReport } from "@/lib/reports";

export async function retrySchoolReport(formData: FormData) {
  const { profile } = await requireAdmin();

  const cycleId = String(formData.get("cycleId") ?? "");
  if (!cycleId) throw new Error("Missing cycle id");

  const admin = createAdminClient();
  await admin.from("school_reports").update({ status: "pending" }).eq("cycle_id", cycleId);

  try {
    await generateSchoolReport(profile.school_id, cycleId);
  } catch (err) {
    await admin.from("school_reports").update({ status: "failed" }).eq("cycle_id", cycleId);
    throw err;
  }

  revalidatePath("/admin");
}
