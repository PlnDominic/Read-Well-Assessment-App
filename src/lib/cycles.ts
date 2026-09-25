import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/**
 * Activates whichever cycle should be current for a school today: the one
 * with the latest starts_at that isn't in the future, breaking ties by
 * created_at so a same-day replacement cycle wins over an older one.
 * Closes whatever else is marked is_current first. Idempotent and cheap
 * (no-ops once the right cycle is already current), so it's safe to call
 * both right after an admin schedules a cycle (for a same-day start) and
 * once a day from the scheduler cron (for a cycle scheduled for a future
 * date, which needs to activate without anyone visiting the page that day).
 */
export async function activateDueCycle(
  supabase: Client,
  schoolId: string
): Promise<{ activated: { id: string; name: string } | null }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: due } = await supabase
    .from("assessment_cycles")
    .select("id, name, is_current")
    .eq("school_id", schoolId)
    .lte("starts_at", today)
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!due || due.is_current) return { activated: null };

  await supabase
    .from("assessment_cycles")
    .update({ is_current: false })
    .eq("school_id", schoolId)
    .eq("is_current", true);
  await supabase.from("assessment_cycles").update({ is_current: true }).eq("id", due.id);

  return { activated: { id: due.id, name: due.name } };
}
