"use client";

import { useState } from "react";

export interface PreparableSession {
  id: string;
  /** Played by the child on a device (true) or given by an adult on the assessor screen. */
  game: boolean;
}

/**
 * "Get this device ready for offline": saves, on this device, everything
 * needed to give the class's unfinished assessments with no connection. For
 * an adult-given assessment that is the assessor screen; for a game it is the
 * game screen plus the questions, which the game keeps in localStorage the
 * same way it does after the child has opened it once (StudentAssessmentRunner).
 * Starting a new assessment still needs a connection, so start the day's
 * assessments first, then prepare the device while you're online.
 */
export function PrepareOffline({ sessions }: { sessions: PreparableSession[] }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [saved, setSaved] = useState(0);

  async function prepare() {
    setState("working");
    let ok = 0;
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
      for (const session of sessions) {
        const page = session.game ? `/student/session/${session.id}` : `/teacher/assess/${session.id}`;
        registration?.active?.postMessage({ type: "cache-page", path: page });
        if (session.game) {
          const res = await fetch(`/api/kiosk/sessions/${session.id}`, { cache: "no-store" });
          if (!res.ok) continue;
          localStorage.setItem(`rw:state:${session.id}`, JSON.stringify(await res.json()));
        }
        ok += 1;
      }
      setSaved(ok);
      setState(ok === sessions.length ? "done" : "failed");
    } catch {
      setSaved(ok);
      setState("failed");
    }
  }

  if (sessions.length === 0) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap mb-5">
      <button
        type="button"
        onClick={prepare}
        disabled={state === "working"}
        className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer disabled:opacity-60"
      >
        {state === "working" ? "Saving…" : "Get this device ready for offline"}
      </button>
      <span role="status" className="text-[13px] text-[var(--color-muted)]">
        {state === "idle" && `Saves ${sessions.length} unfinished assessment${sessions.length === 1 ? "" : "s"} so they work without internet.`}
        {state === "done" && `Ready: ${saved} assessment${saved === 1 ? "" : "s"} saved on this device.`}
        {state === "failed" && `Saved ${saved} of ${sessions.length}. Check the connection and try again.`}
      </span>
    </div>
  );
}
