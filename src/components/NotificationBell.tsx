import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BellIcon } from "@/components/icons";

/**
 * Only rendered inside AppShell's topbar, which itself only appears on
 * authenticated staff pages (teacher/admin/specialist); student-facing
 * pages pass showTopBar={false} since students have no profile row to key
 * a recipient_id off of. Renders nothing if there's somehow no user, same
 * defensive posture as the rest of those pages.
 */
export async function NotificationBell() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .eq("read", false);

  return (
    <Link
      href="/notifications"
      aria-label={count ? `${count} unread notifications` : "Notifications"}
      className="relative w-10 h-10 rounded-full bg-[var(--color-neutral)] flex items-center justify-center no-underline transition-colors hover:bg-[var(--color-neutral-divider)]"
    >
      <BellIcon />
      {!!count && count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-orange)] text-white text-[11px] font-extrabold flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
