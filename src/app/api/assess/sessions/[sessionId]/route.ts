import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAssessorSession, requireAssessor, saveMarks } from "@/lib/readwell/assessorSession";
import { ONE_TO_ONE_PARTS } from "@/lib/readwell/flow";

/**
 * Assessor screen endpoints (src/app/teacher/assess/[sessionId]). Unlike
 * the kiosk routes, these need a signed-in teacher or administrator who
 * can already see the student; see lib/readwell/assessorSession.ts.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const assessor = await requireAssessor();
  if (!assessor) return NextResponse.json({ error: "Only a teacher or administrator can give this assessment" }, { status: 403 });

  const session = await loadAssessorSession(assessor.supabase, sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  return NextResponse.json({ status: session.status, answers: session.answers });
}

/** Body: `{ marks: { [itemId]: value | null } }`; null clears a mark. Saved in one batch so an offline queue can flush at once. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  // A JSON body can't be sent cross-site without a CORS preflight, which
  // this app never grants, so requiring it keeps other sites from posting
  // marks with a teacher's cookies.
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  const assessor = await requireAssessor();
  if (!assessor) return NextResponse.json({ error: "Only a teacher or administrator can give this assessment" }, { status: 403 });

  let body: { marks?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.marks || typeof body.marks !== "object" || Array.isArray(body.marks)) {
    return NextResponse.json({ error: "marks is required" }, { status: 400 });
  }

  const session = await loadAssessorSession(assessor.supabase, sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status === "completed") {
    return NextResponse.json({ error: "This assessment has already been finished" }, { status: 409 });
  }

  const admin = createAdminClient();
  const error = await saveMarks(admin, session, body.marks as Record<string, unknown>, ONE_TO_ONE_PARTS);
  if (error) return NextResponse.json({ error }, { status: 400 });

  if (session.status === "not_started") {
    await admin
      .from("assessment_sessions")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("status", "not_started");
  }

  return NextResponse.json({ ok: true });
}
