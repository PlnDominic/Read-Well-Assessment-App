import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAssessorSession, requireAssessor } from "@/lib/readwell/assessorSession";
import { computeFlow, isOneToOneComplete } from "@/lib/readwell/flow";
import { completeSession } from "@/lib/sessions";

/**
 * Finishes an assessor-led session once every one-to-one part (1-12) is
 * marked or skipped by a gate, then scores it and schedules its reports.
 * The writing task (Part 13) is scored later from the report page.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  const assessor = await requireAssessor();
  if (!assessor) return NextResponse.json({ error: "Only a teacher or administrator can give this assessment" }, { status: 403 });

  const session = await loadAssessorSession(assessor.supabase, sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status === "completed") return NextResponse.json({ ok: true });

  const flows = computeFlow(session.form, session.answers);
  if (!isOneToOneComplete(flows)) {
    const open = flows.filter((f) => f.number <= 12 && f.status !== "complete" && f.status !== "skipped").map((f) => f.number);
    return NextResponse.json({ error: `Parts ${open.join(", ")} aren't finished yet` }, { status: 409 });
  }

  const result = await completeSession(createAdminClient(), sessionId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
