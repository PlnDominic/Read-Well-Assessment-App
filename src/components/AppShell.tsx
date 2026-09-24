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
        <div className="w-full max-w-[1100px] flex justify-between items-center flex-wrap gap-2.5 bg-white rounded-[20px] shadow-[0_4px_16px_rgba(0,0,0,0.05)] px-5 py-3.5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--color-sage)] flex items-center justify-center shadow-[0_4px_10px_rgba(74,107,82,0.3)]">
              <ReadWellMark size={22} />
            </div>
            <span className="font-heading font-bold text-xl tracking-tight text-[var(--color-sage-deep)]">
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
