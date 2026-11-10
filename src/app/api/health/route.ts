import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// For an uptime monitor (UptimeRobot, Better Stack, ...): 200 when the app
// and its database answer, 503 when the database doesn't. Says nothing about
// the data, so it is safe to leave public.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const { error } = await createAdminClient().from("schools").select("id", { head: true, count: "estimated" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, ms: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
