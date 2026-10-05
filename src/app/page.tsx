import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NO_PROFILE_LOGIN, homePathForRole } from "@/lib/staffRouting";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  // No profile is a dead end, not something to guess a home for: guessing
  // "/teacher" here is what used to bounce /teacher -> /login -> "/" forever.
  if (!profile) redirect(NO_PROFILE_LOGIN);
  redirect(homePathForRole(profile.role));
}
