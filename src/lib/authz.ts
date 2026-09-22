import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Several tables (assessments, recommendation_rules, profiles) have no
 * client-facing write policies in supabase/migrations/0002_rls.sql on
 * purpose — those writes are meant to go through the service-role client.
 * This helper is the gate in front of that: it confirms, via the caller's
 * own RLS-scoped session, that they really are an administrator of a
 * school before any server action reaches for the service-role client.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, school_id")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new Error("Profile not found");
  if (profile.role !== "administrator") throw new Error("Administrator access required");

  return { supabase, profile };
}
