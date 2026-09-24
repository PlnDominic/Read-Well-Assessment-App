"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MicIcon, CheckIcon } from "@/components/icons";
import { Sunny3D } from "@/components/Sunny3D";
import { SKILL_AREA_TILE_COLOR, type SkillAreaKey } from "@/lib/theme";

interface KioskItem {
  id: string;
  skillAreaKey: string;
  type: "choice" | "mic";
  prompt: string;
  passage: string | null;
  options: string[] | null;
}

interface KioskState {
  status: "not_started" | "in_progress" | "completed";
  currentItemIndex: number;
  sessionCode?: string;
  studentName: string;
  items: KioskItem[];
  answersByItemId: Record<string, unknown>;
}

// --- localStorage helpers -----------------------------------------------
// TRD §7 "Offline Handling": tolerate brief connectivity drops without
// losing in-progress answers. Three things are cached per session so a
// reload or a dead network mid-assessment doesn't strand the student:
// unsent answers, the last-known server state (so the quiz can still
// render if the very first load happens while offline), and whether a
// "finish" attempt is still waiting to reach the server.

function pendingKey(sessionId: string) {
  return `rw:pending:${sessionId}`;
}
function readPending(sessionId: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(sessionId)) ?? "{}");
  } catch {
    return {};
  }
}
function writePending(sessionId: string, pending: Record<string, unknown>) {
  try {
    localStorage.setItem(pendingKey(sessionId), JSON.stringify(pending));
  } catch {
    // best-effort; localStorage may be unavailable (private browsing, quota)
  }
}

function stateCacheKey(sessionId: string) {
  return `rw:state:${sessionId}`;
}
function readCachedState(sessionId: string): KioskState | null {
  try {
    const raw = localStorage.getItem(stateCacheKey(sessionId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCachedState(sessionId: string, data: KioskState) {
  try {
    localStorage.setItem(stateCacheKey(sessionId), JSON.stringify(data));
  } catch {
    // best-effort
  }
}

// Lets /student/join reopen this assessment from its code with no
// connection (see JoinForm.tsx).
function rememberCode(code: string | undefined, sessionId: string) {
  if (!code) return;
  try {
    localStorage.setItem(`rw:code:${code}`, sessionId);
  } catch {
    // best-effort
  }
}

// Answers given offline live in the pending queue until they sync, so the
// server's copy (or an older cached copy) can be behind this device. Fold
// them back in so a reload doesn't show answered questions as blank or
// send the student back to an earlier question.
function withLocalProgress(sessionId: string, data: KioskState): KioskState {
  const pending = readPending(sessionId);
  const cached = readCachedState(sessionId);
  return {
    ...data,
    answersByItemId: { ...data.answersByItemId, ...pending },
    currentItemIndex: Math.max(data.currentItemIndex, cached?.currentItemIndex ?? 0),
  };
}

function pendingCompleteKey(sessionId: string) {
  return `rw:pendingComplete:${sessionId}`;
}
function readPendingComplete(sessionId: string): boolean {
  try {
    return localStorage.getItem(pendingCompleteKey(sessionId)) === "1";
  } catch {
    return false;
  }
}
function writePendingComplete(sessionId: string, value: boolean) {
  try {
    if (value) localStorage.setItem(pendingCompleteKey(sessionId), "1");
    else localStorage.removeItem(pendingCompleteKey(sessionId));
  } catch {
    // best-effort
  }
}

export function StudentAssessmentRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<KioskState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedState, setUsingCachedState] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [started, setStarted] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(false);
  const pendingRef = useRef<Record<string, unknown>>({});

  const applyState = useCallback((data: KioskState) => {
    setState(data);
    const hasAnyAnswer = Object.keys(data.answersByItemId).length > 0;
    setStarted(data.status !== "not_started" || hasAnyAnswer);
    setQIndex(Math.min(data.currentItemIndex, Math.max(data.items.length - 1, 0)));
  }, []);

  const load = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch(`/api/kiosk/sessions/${sessionId}`, { cache: "no-store" });
    } catch {
      // A thrown fetch (as opposed to a resolved !res.ok) means we're
      // offline, not that the session doesn't exist. Fall back to
      // whatever was last cached so the student isn't stuck on a spinner,
      // and let the online-retry effect below keep trying quietly.
      const cached = readCachedState(sessionId);
      if (cached) {
        setUsingCachedState(true);
        applyState(withLocalProgress(sessionId, cached));
      } else {
        setError("This device is offline and this assessment hasn't been opened here before. Ask your teacher to reconnect it to the internet.");
      }
      return;
    }
    if (!res.ok) {
      setError("We couldn't find that assessment. Ask your teacher for a new code.");
      return;
    }
    let data: KioskState;
    try {
      data = withLocalProgress(sessionId, await res.json());
    } catch {
      setError("Something went wrong loading this assessment. Ask your teacher for help.");
      return;
    }
    rememberCode(data.sessionCode, sessionId);
    writeCachedState(sessionId, data);
    setUsingCachedState(false);
    applyState(data);
  }, [sessionId, applyState]);

  useEffect(() => {
    // Reading browser-only state (navigator.onLine, localStorage) on mount
    // (not derivable during render/SSR) and kicking off the initial
    // fetch (load() only sets state after its internal awaits resolve).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);
    setPendingComplete(readPendingComplete(sessionId));
    pendingRef.current = readPending(sessionId);
    load();
  }, [load, sessionId]);

  const flushPending = useCallback(async (): Promise<boolean> => {
    const pending = { ...pendingRef.current };
    const entries = Object.entries(pending);
    if (entries.length === 0) return true;
    setSyncing(true);
    let allOk = true;
    for (const [itemId, answer] of entries) {
      try {
        const res = await fetch(`/api/kiosk/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, answer }),
        });
        if (res.ok) {
          delete pendingRef.current[itemId];
        } else {
          allOk = false;
        }
      } catch {
        allOk = false;
      }
    }
    writePending(sessionId, pendingRef.current);
    setSyncing(false);
    return allOk;
  }, [sessionId]);

  const attemptComplete = useCallback(async (): Promise<boolean> => {
    const flushed = await flushPending();
    if (!flushed) return false;
    try {
      const res = await fetch(`/api/kiosk/sessions/${sessionId}/complete`, { method: "POST" });
      if (!res.ok) return false;
    } catch {
      return false;
    }
    writePendingComplete(sessionId, false);
    setPendingComplete(false);
    setState((prev) => {
      if (!prev) return prev;
      const next: KioskState = { ...prev, status: "completed" };
      writeCachedState(sessionId, next);
      return next;
    });
    return true;
  }, [sessionId, flushPending]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (usingCachedState) load();
      flushPending();
      if (readPendingComplete(sessionId)) attemptComplete();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(() => {
      if (Object.keys(pendingRef.current).length > 0) flushPending();
    }, 6000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [flushPending, attemptComplete, load, usingCachedState, sessionId]);

  function saveAnswer(itemId: string, answer: unknown) {
    pendingRef.current[itemId] = answer;
    writePending(sessionId, pendingRef.current);
    setState((prev) => {
      if (!prev) return prev;
      const itemIndex = prev.items.findIndex((i) => i.id === itemId);
      const next: KioskState = {
        ...prev,
        answersByItemId: { ...prev.answersByItemId, [itemId]: answer },
        // Mirrors the server's own rule (PATCH /api/kiosk/sessions/:id).
        currentItemIndex: Math.max(prev.currentItemIndex, itemIndex + 1),
      };
      // Keep the device's copy current so an offline reload resumes here.
      writeCachedState(sessionId, next);
      return next;
    });
    flushPending();
  }

  function selectOption(text: string) {
    if (!state) return;
    saveAnswer(state.items[qIndex].id, text);
  }

  function toggleMic(alreadyDone: boolean) {
    if (alreadyDone || !state) return;
    const itemId = state.items[qIndex].id;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    // Chrome/Edge only; Firefox and Safari don't implement SpeechRecognition.
    // Fall back to the old "tap to mark attempted" flow there so the
    // assessment still works, just without real transcript scoring.
    if (!Recognition) {
      setRecording(true);
      setTimeout(() => {
        setRecording(false);
        saveAnswer(itemId, "attempted");
      }, 1200);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setRecording(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "attempted";
      saveAnswer(itemId, transcript);
    };
    recognition.onerror = () => {
      // Mic denied, no speech detected, etc.: still record an attempt so
      // the student isn't stuck unable to proceed.
      saveAnswer(itemId, "attempted");
    };
    recognition.onend = () => {
      setRecording(false);
    };
    recognition.start();
  }

  async function goNext() {
    if (!state) return;
    const isLast = qIndex >= state.items.length - 1;
    if (!isLast) {
      setQIndex((i) => i + 1);
      return;
    }
    setCompleting(true);
    const ok = await attemptComplete();
    setCompleting(false);
    if (!ok) {
      // Could be offline, or a one-off server hiccup; either way, don't
      // dead-end. Remember the intent so a reload still shows the "almost
      // done" screen, and the online-retry effect will keep trying.
      writePendingComplete(sessionId, true);
      setPendingComplete(true);
    }
  }

  if (error) {
    return (
      <div className="w-full max-w-[480px] mt-[10vh] text-center">
        <p className="text-[var(--color-terracotta-dark)] text-lg">{error}</p>
      </div>
    );
  }

  if (pendingComplete) {
    return (
      <div className="w-full max-w-[480px] mt-[10vh] text-center">
        <div className="w-[140px] h-[140px] rounded-full bg-[var(--color-terracotta)] mx-auto mb-6.5 flex items-center justify-center shadow-[0_14px_30px_rgba(201,123,95,0.3)]">
          <Sunny3D size={86} mood="big-smile" />
        </div>
        <h1 className="font-heading font-bold text-[28px] text-[var(--color-sage-deep)] m-0 mb-2.5">
          Almost done!
        </h1>
        <p className="text-[var(--color-body)] text-lg leading-relaxed m-0 mb-6">
          {isOnline
            ? "Finishing up…"
            : "You're offline. Your answers are saved on this device, and we'll finish up as soon as you're back online."}
        </p>
        <button
          onClick={async () => {
            setCompleting(true);
            const ok = await attemptComplete();
            setCompleting(false);
            if (!ok) writePendingComplete(sessionId, true);
          }}
          disabled={completing}
          className="bg-[var(--color-sage)] text-white border-none rounded-full font-heading font-bold text-lg px-10 py-4 cursor-pointer disabled:opacity-60"
        >
          {completing ? "Trying…" : "Try again"}
        </button>
      </div>
    );
  }

  if (!state) {
    return <div className="mt-[20vh] text-[var(--color-body)] text-center">Loading…</div>;
  }

  if (state.status === "completed") {
    return (
      <div className="w-full max-w-[480px] mt-[10vh] text-center">
        <div className="w-[150px] h-[150px] rounded-full bg-[var(--color-terracotta)] mx-auto mb-7 flex items-center justify-center shadow-[0_14px_30px_rgba(201,123,95,0.3)]">
          <CheckIcon />
        </div>
        <h1 className="font-heading font-bold text-3xl text-[var(--color-sage-deep)] m-0 mb-3">
          You&apos;re all done!
        </h1>
        <p className="text-[var(--color-body)] text-lg leading-relaxed m-0 mb-10">
          Great job today. Go tell your teacher you finished!
        </p>
        <button
          onClick={() => router.push("/login")}
          className="bg-[var(--color-sage)] text-white border-none rounded-full font-heading font-bold text-xl px-12 py-4.5 cursor-pointer"
        >
          Finish
        </button>
      </div>
    );
  }

  const offlineBanner = !isOnline && (
    <div className="w-full max-w-[640px] mb-4 bg-[var(--color-gold-bg)] border border-[var(--color-gold-border)] text-[var(--color-gold-text)] text-sm font-bold rounded-xl px-4 py-2.5 text-center">
      You&apos;re offline. Answers are saved on this device and will sync automatically when you&apos;re back online.
    </div>
  );

  if (!started) {
    return (
      <div className="w-full max-w-[480px] mt-[8vh] text-center">
        {offlineBanner}
        <div className="w-[140px] h-[140px] rounded-full bg-[var(--color-sage)] mx-auto mb-6.5 flex items-center justify-center shadow-[0_14px_30px_rgba(74,107,82,0.28)]">
          <Sunny3D size={86} mood="big-smile" />
        </div>
        <h1 className="font-heading font-bold text-[30px] text-[var(--color-sage-deep)] m-0 mb-2.5">
          Hi! I&apos;m Sunny.
        </h1>
        <p className="text-[var(--color-body)] text-lg leading-relaxed m-0 mb-10">
          Let&apos;s read some words together. There are no wrong answers. Just try your best!
        </p>
        <button
          onClick={() => setStarted(true)}
          className="bg-[var(--color-terracotta)] text-white border-none rounded-full font-heading font-bold text-xl px-14 py-5 cursor-pointer shadow-[0_10px_20px_rgba(201,123,95,0.35)]"
        >
          Let&apos;s Start!
        </button>
      </div>
    );
  }

  const item = state.items[qIndex];
  const skillLabel = item.skillAreaKey.replace(/([A-Z])/g, " $1").toUpperCase();
  const tileColor = SKILL_AREA_TILE_COLOR[item.skillAreaKey as SkillAreaKey] ?? "var(--color-sage)";
  const savedAnswer = state.answersByItemId[item.id];
  const selectedOption = typeof savedAnswer === "string" ? savedAnswer : null;
  const micDone = typeof savedAnswer === "string" && savedAnswer.length > 0;
  const micStatus = recording ? "recording" : micDone ? "done" : "idle";
  const canProceed = item.type === "choice" ? selectedOption !== null : micDone;
  const progressPercent = Math.round((qIndex / state.items.length) * 100 + 10);
  const isLast = qIndex >= state.items.length - 1;

  return (
    <div className="w-full max-w-[640px] mt-[2vh]">
      {offlineBanner}
      <div className="flex items-center gap-3.5 mb-7">
        <div className="flex-1 h-3.5 bg-[var(--color-cream-border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-sage)] rounded-full transition-[width]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="font-extrabold text-[var(--color-body)] text-[15px] whitespace-nowrap">
          Question {qIndex + 1} of {state.items.length}
        </span>
        {syncing && <span className="text-xs text-[var(--color-muted)]">Saving…</span>}
      </div>

      <div className="bg-white rounded-3xl px-7.5 py-9 shadow-[0_6px_20px_rgba(0,0,0,0.06)] text-center">
        <div
          className="inline-block text-white font-extrabold text-xs tracking-wide px-3.5 py-1.5 rounded-full mb-4.5"
          style={{ background: tileColor }}
        >
          {skillLabel}
        </div>

        {item.passage && (
          <div className="bg-[var(--color-cream)] rounded-2xl px-5 py-4 mb-4.5 text-lg text-[var(--color-ink-soft)] leading-relaxed">
            {item.passage}
          </div>
        )}

        <p className="font-heading font-bold text-2xl text-[var(--color-sage-deep)] m-0 mb-7 leading-snug">
          {item.prompt}
        </p>

        {item.type === "mic" && (
          <>
            <button
              onClick={() => toggleMic(micDone)}
              aria-label={
                micStatus === "done" ? "Reading recorded" : micStatus === "recording" ? "Listening" : "Tap to read aloud"
              }
              className="w-[120px] h-[120px] rounded-full border-none flex items-center justify-center mx-auto mb-3 cursor-pointer transition-transform"
              style={{
                background: micStatus === "done" ? "var(--color-sage)" : micStatus === "recording" ? "var(--color-terracotta-dark)" : "var(--color-terracotta)",
              }}
            >
              <MicIcon />
            </button>
            <div className="text-[var(--color-body)] font-bold text-[15px]">
              {micStatus === "done" ? "Great reading! ✓" : micStatus === "recording" ? "Listening…" : "Tap to read aloud"}
            </div>
          </>
        )}

        {item.type === "choice" && item.options && (
          <div className="grid gap-3.5">
            {item.options.map((text) => {
              const isSelected = selectedOption === text;
              return (
                <button
                  key={text}
                  onClick={() => selectOption(text)}
                  className="text-center font-heading font-bold text-lg py-5 rounded-2xl cursor-pointer border-[2.5px] transition-colors"
                  style={{
                    borderColor: isSelected ? "var(--color-sage)" : "var(--color-cream-border)",
                    background: isSelected ? "var(--color-sage-tint)" : "white",
                    color: "var(--color-sage-deep)",
                  }}
                >
                  {text}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end mt-5.5">
        {canProceed && (
          <button
            onClick={goNext}
            disabled={completing}
            className="bg-[var(--color-sage)] text-white border-none rounded-full font-heading font-bold text-lg px-9.5 py-3.5 cursor-pointer disabled:opacity-60"
          >
            {completing ? "Finishing…" : isLast ? "I'm Done!" : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}
