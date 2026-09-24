"use client";

import { useEffect, useState } from "react";

// Shown on staff pages when there's no connection: the page is the copy
// saved on this device, and anything that changes data needs the server.
// Also flags <body> so globals.css can grey out submit buttons.
export function StaffOfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => {
      const isOffline = !navigator.onLine;
      setOffline(isOffline);
      if (isOffline) document.body.dataset.offline = "true";
      else delete document.body.dataset.offline;
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      delete document.body.dataset.offline;
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="w-full max-w-[1100px] mb-4 bg-[var(--color-gold-bg)] border border-[var(--color-gold-border)] text-[var(--color-gold-text)] text-sm font-bold rounded-xl px-4 py-2.5 text-center"
    >
      You&apos;re offline. You&apos;re seeing this page as it was when last loaded on this device. Changes
      need an internet connection.
    </div>
  );
}
