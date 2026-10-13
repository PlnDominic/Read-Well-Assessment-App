"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readOutbox, syncOutbox } from "@/lib/staffOutbox";

/**
 * Sends what an assessor did offline (marks, and assessments finished
 * without a connection) as soon as the device is online, from whichever staff
 * page is open, and says so while anything is waiting. See src/lib/staffOutbox.ts.
 */
export function StaffOutboxSync() {
  const router = useRouter();
  const [waiting, setWaiting] = useState(0);
  const [online, setOnline] = useState(true);

  const run = useCallback(async () => {
    try {
      if (navigator.onLine && readOutbox(localStorage).length > 0) {
        const { finished } = await syncOutbox(localStorage, (input, init) => fetch(input, init));
        if (finished.length > 0) router.refresh();
      }
      setWaiting(readOutbox(localStorage).length);
    } catch {
      // Storage unavailable (private window): nothing was queued.
    }
  }, [router]);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      run();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const interval = setInterval(run, 15000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(interval);
    };
  }, [run]);

  if (waiting === 0) return null;
  return (
    <div
      role="status"
      className="w-full max-w-[1100px] mb-4 bg-[var(--color-orange-tint)] border border-[var(--color-orange-tint-border)] text-[var(--color-orange-dark)] text-sm font-bold rounded-xl px-4 py-2.5 text-center"
    >
      {waiting === 1 ? "1 assessment is" : `${waiting} assessments are`} saved on this device
      {online ? " and syncing now." : ". It will sync automatically when you're back online."}
    </div>
  );
}
