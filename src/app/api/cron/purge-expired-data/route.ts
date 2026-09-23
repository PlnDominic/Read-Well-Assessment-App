import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily data-retention purge (see /admin/settings and
 * supabase/migrations/0008_data_retention.sql). Only schools that have
 * opted into a `data_retention_days` value are touched — the TRD leaves
 * the actual policy unconfirmed, so the default (NULL) keeps data
 * indefinitely.
 *
 * Deleting a completed `assessment_sessions` row cascades to `responses`,
 * `results`, and `student_reports` (see 0001_init.sql's foreign keys), but
 * not to the report PDF sitting in Storage — those are removed explicitly
 * before the row delete so nothing is orphaned in the `reports` bucket.
 *
 * Configured as a Vercel Cron Job in vercel.json. Vercel adds
 * `Authorization: Bearer $CRON_SECRET` to its own requests once that env
 * var is set — this route rejects anything else so the endpoint can't be
 * used to mass-delete data if its URL leaks.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: schools, error: schoolsError } = await admin
    .from("schools")
    .select("id, data_retention_days")
    .not("data_retention_days", "is", null);
  if (schoolsError) return NextResponse.json({ error: schoolsError.message }, { status: 500 });

  let totalDeleted = 0;
  const results: { schoolId: string; sessionsDeleted: number }[] = [];

  for (const school of schools ?? []) {
    const days = school.data_retention_days;
    if (!days) continue;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: students } = await admin.from("students").select("id").eq("school_id", school.id);
    const studentIds = (students ?? []).map((s) => s.id);
    if (studentIds.length === 0) continue;

    const { data: expiredSessions } = await admin
      .from("assessment_sessions")
      .select("id")
      .eq("status", "completed")
      .lt("completed_at", cutoff)
      .in("student_id", studentIds);
    const sessionIds = (expiredSessions ?? []).map((s) => s.id);
    if (sessionIds.length === 0) continue;

    const { data: reports } = await admin
      .from("student_reports")
      .select("pdf_path")
      .in("session_id", sessionIds)
      .not("pdf_path", "is", null);
    const paths = (reports ?? []).map((r) => r.pdf_path).filter((p): p is string => !!p);
    if (paths.length > 0) {
      await admin.storage.from("reports").remove(paths);
    }

    const { error: deleteError } = await admin.from("assessment_sessions").delete().in("id", sessionIds);
    if (deleteError) continue;

    totalDeleted += sessionIds.length;
    results.push({ schoolId: school.id, sessionsDeleted: sessionIds.length });

    await admin.from("audit_log").insert({
      actor_id: null,
      action: "data.purge_expired",
      resource_type: "school",
      resource_id: school.id,
      metadata: { sessionsDeleted: sessionIds.length, retentionDays: days, cutoff },
    });
  }

  return NextResponse.json({ ok: true, totalDeleted, results });
}
