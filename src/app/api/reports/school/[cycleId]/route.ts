import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Same pattern as the student report route — see its comment for the auth model. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: report, error } = await supabase
    .from("school_reports")
    .select("pdf_path, status")
    .eq("cycle_id", cycleId)
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
    resource_type: "school_report",
    resource_id: cycleId,
  });

  return NextResponse.redirect(signed.signedUrl);
}
