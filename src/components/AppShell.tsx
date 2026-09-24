import { ReadWellMark } from "@/components/icons";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { StaffOfflineBanner } from "@/components/StaffOfflineBanner";

export function AppShell({
  children,
  showTopBar = true,
}: {
  children: React.ReactNode;
  showTopBar?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center px-4 pt-6 pb-15">
      {showTopBar && (
        <div className="w-full max-w-[1100px] flex justify-between items-center mb-5 flex-wrap gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[var(--color-sage)] flex items-center justify-center">
              <ReadWellMark />
            </div>
            <span className="font-heading font-bold text-xl text-[var(--color-sage-deep)]">
              Read Well
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>
      )}
      {showTopBar && <StaffOfflineBanner />}
      {children}
    </div>
  );
}
