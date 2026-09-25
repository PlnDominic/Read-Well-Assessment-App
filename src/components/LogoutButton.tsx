"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearStaffOfflineData } from "@/lib/offline";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          // Remove saved staff pages first: they hold student data, and this
          // may be a shared device.
          await clearStaffOfflineData();
          const supabase = createClient();
          // A normal sign-out calls the server and, if that fails, leaves the
          // session in place. Offline, end it on this device only.
          await supabase.auth.signOut({ scope: navigator.onLine ? "global" : "local" });
          router.push("/login");
          router.refresh();
        })
      }
      className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] font-bold text-sm px-4 py-2.25 rounded-full cursor-pointer transition-colors hover:bg-[var(--color-neutral-divider)] disabled:opacity-60"
    >
      {isPending ? "Logging out…" : "Log Out"}
    </button>
  );
}
