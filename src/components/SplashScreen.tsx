"use client";

import { useEffect, useState } from "react";
import { SunnyAvatar } from "@/components/SunnyAvatar";

const MIN_VISIBLE_MS = 700;
const FADE_MS = 300;

/**
 * A brief branded cover screen shown only when the app is launched as an
 * installed PWA (from a home-screen icon), where there's no browser chrome
 * to show the page is loading -- otherwise the user would see a blank white
 * flash before fonts/hydration finish. A normal browser tab already has its
 * own loading UI, so this renders nothing there.
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
      setVisible(standalone);
    };
    checkStandalone();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setFading(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!fading) return;
    const timer = setTimeout(() => setVisible(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [fading]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[var(--color-bg)] transition-opacity ease-out"
      style={{ transitionDuration: `${FADE_MS}ms`, opacity: fading ? 0 : 1 }}
    >
      <SunnyAvatar size={120} />
      <span className="font-heading font-bold text-3xl tracking-tight text-[var(--color-ink)]">Read Well</span>
    </div>
  );
}
