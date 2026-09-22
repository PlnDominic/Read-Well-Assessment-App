import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client. Bypasses RLS entirely — never import this
 * into a Client Component, and never expose SUPABASE_SERVICE_ROLE_KEY to
 * the browser.
 *
 * This is the client used for the student assessment kiosk flow (session
 * code redemption, autosave, completion) because students never
 * authenticate (TRD §6), so there is no auth.uid() for RLS to key off of.
 * Authorization for those operations is enforced in application code
 * against the session_code instead — see src/lib/kiosk.ts.
 *
 * It is also used by the background report-generation job, which runs
 * outside any user's request context.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
