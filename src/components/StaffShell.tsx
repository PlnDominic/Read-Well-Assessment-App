import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { StaffOfflineBanner } from "@/components/StaffOfflineBanner";
import { StaffOutboxSync } from "@/components/StaffOutboxSync";
import { StaffSidebar, type SidebarVariant } from "@/components/StaffSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ROLE_AVATAR } from "@/lib/avatars";
import type { UserRole } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

const VARIANT: Record<UserRole, SidebarVariant> = {
  administrator: "admin",
  teacher: "teacher",
  reading_specialist: "specialist",
};

/**
 * The page around every signed-in staff screen except the assessor screen
 * (which keeps the whole width for the child's task): the navigation down the
 * left, the page on the right, and the offline notices above it. Which links
 * the sidebar shows depends on the person's role.
 */
export async function StaffShell({ role, children }: { role?: UserRole; children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("school_id").eq("id", user.id).single() : { data: null };
  const { data: school } = profile ? await supabase.from("schools").select("name").eq("id", profile.school_id).maybeSingle() : { data: null };
  const shownRole = role ?? "teacher";

  return (
    <div className="min-h-screen bg-[var(--color-bg)] md:flex">
      {/* Skip link (WCAG 2.4.1): jump past the navigation to the page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-[var(--color-orange)] focus:text-[var(--color-on-orange)] focus:font-bold focus:text-sm focus:px-4 focus:py-2.5 focus:rounded-full"
      >
        Skip to main content
      </a>
      <StaffSidebar
        variant={VARIANT[shownRole]}
        avatarSrc={ROLE_AVATAR[shownRole]}
        schoolName={school?.name}
        footer={
          <>
            <ThemeToggle />
            <NotificationBell />
            <LogoutButton />
          </>
        }
      />
      <div className="flex-1 min-w-0">
        <main id="main-content" className="px-4 sm:px-8 lg:px-12 py-6 md:py-10 max-w-[1040px]">
          <StaffOfflineBanner />
          <StaffOutboxSync />
          {children}
        </main>
      </div>
    </div>
  );
}
