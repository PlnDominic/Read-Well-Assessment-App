import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSessionForKiosk } from "@/lib/kiosk";
import { completeSession } from "@/lib/sessions";

/**
 * POST /api/kiosk/sessions/:id/complete: Assessment Service "complete"
 * endpoint (TRD §4.1); see completeSession in lib/sessions.ts. Not for
 * assessor-led sessions, which only a signed-in assessor can finish
 * (/api/assess/sessions/:id/complete).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const admin = createAdminClient();

  const state = await loadSessionForKiosk(admin, sessionId);
  if (!state) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (state.assessorLed) return NextResponse.json({ error: ASSESSOR_LED_ERROR }, { status: 409 });

  const result = await completeSession(admin, sessionId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

const ASSESSOR_LED_ERROR = "This assessment is given by a teacher on the assessor screen.";
