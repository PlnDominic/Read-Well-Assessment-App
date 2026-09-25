import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTION_LABELS: Record<string, string> = {
  "report.view": "Viewed",
  "report.export": "Exported",
  "report.export_csv": "Exported CSV of",
  "report.export_bulk": "Exported all reports for",
  "settings.data_retention_updated": "Updated",
};

const RESOURCE_LABELS: Record<string, string> = {
  student_report: "a student report",
  school_report: "the school-wide report",
  school: "the school's settings",
  class: "their class",
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; action?: string; from?: string; to?: string }>;
}) {
  const { actor, action, from, to } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, school_id").eq("id", user.id).single();
  if (!profile || profile.role !== "administrator") redirect("/");

  // audit_log has no client-facing RLS policy by design (written/read via
  // service role only); this is the one place that reads it, gated by the
  // administrator check above, same pattern as the other admin-only reads
  // that lack RLS policies (assessments, recommendation_rules).
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("school_id", profile.school_id)
    .order("name");
  const staffIds = (staff ?? []).map((s) => s.id);
  const nameByActorId = new Map((staff ?? []).map((s) => [s.id, s.name]));

  const admin = createAdminClient();
  let query = admin
    .from("audit_log")
    .select("id, actor_id, action, resource_type, resource_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  query = actor && staffIds.includes(actor) ? query.eq("actor_id", actor) : query.in("actor_id", staffIds);
  if (action) query = query.eq("action", action);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data: logs } = staffIds.length > 0 ? await query : { data: [] };
  const hasFilters = !!(actor || action || from || to);

  return (
    <div className="w-full max-w-[920px]">
      <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-ink)] m-0 mb-1">Audit Log</h1>
      <p className="text-[var(--color-muted)] text-sm m-0 mb-6">
        Who viewed or exported a report, most recent first (last 200 matching events).
      </p>

      <form
        method="get"
        className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-6 mb-5 flex flex-wrap items-end gap-3.5"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Staff member</span>
          <select
            name="actor"
            defaultValue={actor ?? ""}
            className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm min-w-[160px]"
          >
            <option value="">All staff</option>
            {(staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Action</span>
          <select
            name="action"
            defaultValue={action ?? ""}
            className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm min-w-[160px]"
          >
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">From</span>
          <input
            name="from"
            type="date"
            defaultValue={from ?? ""}
            className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">To</span>
          <input
            name="to"
            type="date"
            defaultValue={to ?? ""}
            className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-sm px-5 py-2.75 cursor-pointer"
        >
          Filter
        </button>
        {hasFilters && (
          <a
            href="/admin/audit"
            className="text-[var(--color-orange-dark)] font-bold text-sm no-underline px-2 py-2.75"
          >
            Clear
          </a>
        )}
      </form>

      <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] overflow-hidden">
        {(logs ?? []).length === 0 && (
          <div className="px-6 py-8 text-[var(--color-muted)] text-center">
            {hasFilters ? "No activity matches these filters." : "No activity recorded yet."}
          </div>
        )}
        {(logs ?? []).map((log) => (
          <div
            key={log.id}
            className="px-6 py-3.5 border-b border-[var(--color-neutral-divider)] last:border-b-0 flex items-center justify-between gap-3 flex-wrap"
          >
            <div className="text-sm text-[var(--color-ink-soft)]">
              <span className="font-extrabold text-[var(--color-ink)]">
                {(log.actor_id && nameByActorId.get(log.actor_id)) ?? "Unknown"}
              </span>{" "}
              {ACTION_LABELS[log.action] ?? log.action}{" "}
              <span className="text-[var(--color-muted)]">
                {RESOURCE_LABELS[log.resource_type] ?? log.resource_type}
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
