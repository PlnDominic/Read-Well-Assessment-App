"use client";

import { useEffect } from "react";

// Production only: a service worker caching pages during `next dev` makes
// local edits look like they aren't taking effect.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(buildId)}`, { scope: "/" }).catch(() => {
      // Offline support is an enhancement; the app still works without it.
    });
  }, []);

  return null;
}
