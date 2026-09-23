import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateResponse, loadSessionForKiosk } from "@/lib/kiosk";

/**
 * Kiosk endpoints (student-facing, no auth; see supabase/migrations/0002_rls.sql
 * for why these use the service-role client instead of RLS).
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const admin = createAdminClient();
  const state = await loadSessionForKiosk(admin, sessionId);
  if (!state) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const answersByItemId = Object.fromEntries(state.responses.map((r) => [r.item_id, r.answer]));

  return NextResponse.json({
    status: state.session.status,
    currentItemIndex: state.session.current_item_index,
    // The code the student already typed to get here; the page remembers it
    // so the same code can reopen this assessment on this device offline.
    sessionCode: state.session.session_code,
    studentName: state.studentName,
    // Never send `isCorrect` on options to the client.
    items: state.items.map((item) => ({
      id: item.id,
      skillAreaKey: item.skillAreaKey,
      type: item.type,
      prompt: item.prompt,
      passage: item.passage ?? null,
      options: item.options?.map((o) => o.text) ?? null,
    })),
    answersByItemId,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const body = (await req.json()) as { itemId?: string; answer?: unknown };
  if (!body.itemId || body.answer === undefined) {
    return NextResponse.json({ error: "itemId and answer are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const state = await loadSessionForKiosk(admin, sessionId);
  if (!state) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (state.session.status === "completed") {
    return NextResponse.json({ error: "This assessment has already been completed" }, { status: 409 });
  }

  const item = state.items.find((i) => i.id === body.itemId);
  if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 400 });

  const isCorrect = evaluateResponse(item, body.answer);

  const { error: responseError } = await admin
    .from("responses")
    .upsert(
      { session_id: sessionId, item_id: item.id, answer: body.answer, is_correct: isCorrect },
      { onConflict: "session_id,item_id" }
    );
  if (responseError) return NextResponse.json({ error: responseError.message }, { status: 500 });

  const itemIndex = state.items.findIndex((i) => i.id === item.id);
  const nextIndex = Math.max(state.session.current_item_index, itemIndex + 1);

  const { error: sessionError } = await admin
    .from("assessment_sessions")
    .update({
      current_item_index: nextIndex,
      status: state.session.status === "not_started" ? "in_progress" : state.session.status,
      started_at: state.session.status === "not_started" ? new Date().toISOString() : undefined,
    })
    .eq("id", sessionId);
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  return NextResponse.json({ ok: true, isCorrect, currentItemIndex: nextIndex });
}
