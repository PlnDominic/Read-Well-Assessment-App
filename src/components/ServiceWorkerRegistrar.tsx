"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Production only: a service worker caching pages during `next dev` makes
// local edits look like they aren't taking effect.
const ENABLED = process.env.NODE_ENV === "production";

export function ServiceWorkerRegistrar() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ENABLED || !("serviceWorker" in navigator)) return;
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(buildId)}`, { scope: "/" }).catch(() => {
      // Offline support is an enhancement; the app still works without it.
    });
  }, []);

  // Next.js navigations fetch data rather than whole pages, so the service
  // worker never sees them. Ask it to save each page as it's shown; it
  // decides which pages are allowed to be kept on the device.
  useEffect(() => {
    if (!ENABLED || !("serviceWorker" in navigator) || !navigator.onLine) return;
    const path = window.location.pathname + window.location.search;
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: "cache-page", path }))
      .catch(() => undefined);
  }, [pathname]);

  return null;
}
