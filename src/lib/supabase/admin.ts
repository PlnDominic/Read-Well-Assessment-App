import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. Bypasses RLS entirely; never import this
 * into a Client Component, and never expose SUPABASE_SERVICE_ROLE_KEY to
 * the browser.
 *
 * Used only after the caller's access has been checked through their own
 * RLS-scoped client (e.g. requireAdmin(), loadAssessorSession()), for
 * writes to tables with no client-facing write policy (responses,
 * audit_log, results), and by the background report-generation job, which
 * runs outside any user's request context.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
