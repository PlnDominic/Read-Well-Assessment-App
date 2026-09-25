"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { activateDueCycle } from "@/lib/cycles";

/**
 * Inserts the cycle as scheduled (not current) and immediately reconciles
 * which cycle should be active: a same-day start takes effect right away,
 * same as before this scheduling feature existed, while a future start
 * date leaves the current cycle running until the scheduler cron flips
 * them over on its own that day (see /api/cron/cycle-scheduler).
 */
export async function startNewCycle(formData: FormData) {
  const { supabase, profile } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAtRaw = String(formData.get("endsAt") ?? "").trim();
  if (!name || !startsAt) throw new Error("Name and start date are required");
  if (endsAtRaw && endsAtRaw <= startsAt) throw new Error("End date must be after the start date");

  const { error: insertError } = await supabase.from("assessment_cycles").insert({
    school_id: profile.school_id,
    name,
    starts_at: startsAt,
    ends_at: endsAtRaw || null,
    is_current: false,
  });
  if (insertError) throw new Error(insertError.message);

  await activateDueCycle(supabase, profile.school_id);

  revalidatePath("/admin/cycles");
  revalidatePath("/admin");
  revalidatePath("/teacher");
}
