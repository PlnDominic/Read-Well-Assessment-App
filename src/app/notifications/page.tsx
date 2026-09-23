import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  student_report_ready: "Student report",
  school_report_ready: "School report",
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, message, link, read, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  return (
    <AppShell>
      <div className="w-full max-w-[760px]">
        <div className="flex justify-between items-center flex-wrap gap-3 mb-6">
          <h1 className="font-heading font-bold text-[26px] text-[var(--color-sage-deep)] m-0">Notifications</h1>
          {unreadCount > 0 && (
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                className="bg-white border-[1.5px] border-[var(--color-cream-border-strong)] text-[var(--color-sage-dark)] font-bold text-sm px-4 py-2 rounded-full cursor-pointer"
              >
                Mark all as read
              </button>
            </form>
          )}
        </div>

        <div className="bg-white rounded-[20px] shadow-[0_6px_20px_rgba(0,0,0,0.06)] overflow-hidden">
          {(notifications ?? []).length === 0 && (
            <div className="px-6 py-8 text-[var(--color-muted)] text-center">No notifications yet.</div>
          )}
          {(notifications ?? []).map((n) => (
            <div
              key={n.id}
              className="px-6 py-4 border-b border-[var(--color-cream-divider)] last:border-b-0 flex items-center justify-between gap-3 flex-wrap"
              style={{ background: n.read ? "transparent" : "var(--color-sage-tint)" }}
            >
              <div className="text-sm">
                <span className="font-bold text-[var(--color-muted)] text-xs uppercase mr-2">
                  {TYPE_LABELS[n.type] ?? n.type}
                </span>
                {n.link ? (
                  <Link href={n.link} className="text-[var(--color-ink-soft)] font-bold no-underline">
                    {n.message}
                  </Link>
                ) : (
                  <span className="text-[var(--color-ink-soft)] font-bold">{n.message}</span>
                )}
                <div className="text-xs text-[var(--color-muted-light)] mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
              {!n.read && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className="text-[var(--color-sage-dark)] text-xs font-bold bg-none border-none cursor-pointer whitespace-nowrap"
                  >
                    Mark as read
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
