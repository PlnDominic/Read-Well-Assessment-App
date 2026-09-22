import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTION_LABELS: Record<string, string> = {
  "report.view": "Viewed",
  "report.export": "Exported",
};

export default async function AdminAuditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect("/");

  // audit_log has no client-facing RLS policy by design (written/read via
  // service role only) — this is the one place that reads it, gated by the
  // administrator check above, same pattern as the other admin-only reads
  // that lack RLS policies (assessments, recommendation_rules).
  const { data: staff } = await supabase.from("profiles").select("id, name").eq("school_id", profile.school_id);
  const staffIds = (staff ?? []).map((s) => s.id);
  const nameByActorId = new Map((staff ?? []).map((s) => [s.id, s.name]));

  const admin = createAdminClient();
  const { data: logs } =
    staffIds.length > 0
      ? await admin
          .from("audit_log")
          .select("id, actor_id, action, resource_type, resource_id, created_at")
          .in("actor_id", staffIds)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] };

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[26px] text-[var(--color-sage-deep)] m-0 mb-1">Audit Log</h1>
      <p className="text-[var(--color-muted)] text-sm m-0 mb-6">
        Who viewed or exported a report, most recent first (last 200 events).
      </p>

      <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] overflow-hidden">
        {(logs ?? []).length === 0 && (
          <div className="px-6 py-8 text-[var(--color-muted)] text-center">No activity recorded yet.</div>
        )}
        {(logs ?? []).map((log) => (
          <div
            key={log.id}
            className="px-6 py-3.5 border-b border-[var(--color-cream-divider)] last:border-b-0 flex items-center justify-between gap-3 flex-wrap"
          >
            <div className="text-sm text-[var(--color-ink-soft)]">
              <span className="font-extrabold text-[var(--color-sage-deep)]">
                {(log.actor_id && nameByActorId.get(log.actor_id)) ?? "Unknown"}
              </span>{" "}
              {ACTION_LABELS[log.action] ?? log.action}{" "}
              <span className="text-[var(--color-muted)]">
                {log.resource_type === "student_report" ? "a student report" : "the school-wide report"}
              </span>
            </div>
            <span className="text-xs text-[var(--color-muted-light)] whitespace-nowrap">
              {new Date(log.created_at).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
