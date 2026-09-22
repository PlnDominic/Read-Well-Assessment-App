"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";

export async function startNewCycle(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  if (!name || !startsAt) throw new Error("Name and start date are required");

  const { error: closeError } = await supabase
    .from("assessment_cycles")
    .update({ is_current: false })
    .eq("school_id", profile.school_id)
    .eq("is_current", true);
  if (closeError) throw new Error(closeError.message);

  const { error: insertError } = await supabase.from("assessment_cycles").insert({
    school_id: profile.school_id,
    name,
    starts_at: startsAt,
    is_current: true,
  });
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/admin/cycles");
  revalidatePath("/admin");
  revalidatePath("/teacher");
}
