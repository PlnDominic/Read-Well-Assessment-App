import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mints a short-lived signed URL for a student's report PDF and redirects
 * to it. Authorization is the RLS-scoped `student_reports` read below (TRD
 * §8: reports must not be publicly accessible by guessable URL and must
 * match the student's report permissions); the admin client is only used
 * afterwards, to sign the URL and to write the audit log entry.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: report, error } = await supabase
    .from("student_reports")
    .select("pdf_path, status")
    .eq("session_id", sessionId)
    .single();
  if (error || !report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (report.status !== "ready" || !report.pdf_path) {
    return NextResponse.json({ error: "Report is not ready yet" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("reports")
    .createSignedUrl(report.pdf_path, 60);
  if (signError || !signed) return NextResponse.json({ error: "Could not sign report URL" }, { status: 500 });

  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "report.export",
    resource_type: "student_report",
    resource_id: sessionId,
  });

  return NextResponse.redirect(signed.signedUrl);
}
