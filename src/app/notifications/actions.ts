"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markNotificationRead(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing notification id");

  // RLS (notifications_update_own) already scopes this to the caller's own
  // rows; the recipient_id filter here is belt-and-suspenders, not the
  // actual security boundary.
  await supabase.from("notifications").update({ read: true }).eq("id", id).eq("recipient_id", user.id);

  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  await supabase.from("notifications").update({ read: true }).eq("recipient_id", user.id).eq("read", false);

  revalidatePath("/notifications");
}
