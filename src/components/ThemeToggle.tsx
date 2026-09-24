"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Explicit light/dark override on top of the OS-preference default already
 * applied globally in globals.css. Reads/writes localStorage directly
 * (rather than through a runtime capability) since this is a plain
 * per-browser UI preference, not state anything else needs to see; the
 * inline script in layout.tsx applies the stored value before first paint
 * so this button's initial render (after that) just needs to match it.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const readTheme = () => setTheme(currentTheme());
    readTheme();
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing / blocked storage: the toggle still works for this
      // page load via the data-theme attribute, it just won't persist.
    }
    document.documentElement.setAttribute("data-theme", next);
  }

  // Renders the light-mode icon (matching the server-rendered markup) until
  // the effect above resolves the real preference, to avoid a hydration
  // mismatch; the flip to the correct icon happens within the same paint.
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-10 h-10 rounded-full bg-[var(--color-neutral)] flex items-center justify-center border-none cursor-pointer transition-colors hover:bg-[var(--color-neutral-divider)]"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
