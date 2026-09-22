"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SunnyMascot, MicIcon, CheckIcon } from "@/components/icons";
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
  studentName: string;
  items: KioskItem[];
  answersByItemId: Record<string, unknown>;
}

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

export function StudentAssessmentRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<KioskState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const pendingRef = useRef<Record<string, unknown>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/kiosk/sessions/${sessionId}`, { cache: "no-store" });
    if (!res.ok) {
      setError("We couldn't find that assessment. Ask your teacher for a new code.");
      return;
    }
    const data: KioskState = await res.json();
    setState(data);
    const hasAnyAnswer = Object.keys(data.answersByItemId).length > 0;
    setStarted(data.status !== "not_started" || hasAnyAnswer);
    setQIndex(Math.min(data.currentItemIndex, Math.max(data.items.length - 1, 0)));
  }, [sessionId]);

  useEffect(() => {
    // Fetch-on-mount: `load` sets state only after its internal `await`s
    // resolve, so this isn't a synchronous setState-in-effect despite the
    // lint rule's static check flagging the call itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    pendingRef.current = readPending(sessionId);
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

  useEffect(() => {
    const onOnline = () => flushPending();
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => {
      if (Object.keys(pendingRef.current).length > 0) flushPending();
    }, 6000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [flushPending]);

  function saveAnswer(itemId: string, answer: unknown) {
    pendingRef.current[itemId] = answer;
    writePending(sessionId, pendingRef.current);
    setState((prev) => (prev ? { ...prev, answersByItemId: { ...prev.answersByItemId, [itemId]: answer } } : prev));
    flushPending();
  }

  function selectOption(text: string) {
    if (!state) return;
    saveAnswer(state.items[qIndex].id, text);
  }

  function toggleMic(alreadyDone: boolean) {
    if (alreadyDone || !state) return;
    setRecording(true);
    setTimeout(() => {
      setRecording(false);
      saveAnswer(state.items[qIndex].id, "attempted");
    }, 1200);
  }

  async function goNext() {
    if (!state) return;
    const isLast = qIndex >= state.items.length - 1;
    if (!isLast) {
      setQIndex((i) => i + 1);
      return;
    }
    setCompleting(true);
    const flushed = await flushPending();
    if (!flushed) {
      setCompleting(false);
      setError("Still saving your answers — check your connection and try again in a moment.");
      return;
    }
    const res = await fetch(`/api/kiosk/sessions/${sessionId}/complete`, { method: "POST" });
    setCompleting(false);
    if (!res.ok) {
      setError("Something went wrong finishing up. Try tapping the button again.");
      return;
    }
    setState((prev) => (prev ? { ...prev, status: "completed" } : prev));
  }

  if (error) {
    return (
      <div className="w-full max-w-[480px] mt-[10vh] text-center">
        <p className="text-[var(--color-terracotta-dark)] text-lg">{error}</p>
      </div>
    );
  }

  if (!state) {
    return <div className="mt-[20vh] text-[var(--color-body)]">Loading…</div>;
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

  if (!started) {
    return (
      <div className="w-full max-w-[480px] mt-[8vh] text-center">
        <div className="w-[140px] h-[140px] rounded-full bg-[var(--color-sage)] mx-auto mb-6.5 flex items-center justify-center shadow-[0_14px_30px_rgba(74,107,82,0.28)]">
          <SunnyMascot size={86} mood="big-smile" />
        </div>
        <h1 className="font-heading font-bold text-[30px] text-[var(--color-sage-deep)] m-0 mb-2.5">
          Hi! I&apos;m Sunny.
        </h1>
        <p className="text-[var(--color-body)] text-lg leading-relaxed m-0 mb-10">
          Let&apos;s read some words together. There&apos;s no wrong answers &mdash; just try your best!
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
  const micDone = savedAnswer === "attempted";
  const micStatus = recording ? "recording" : micDone ? "done" : "idle";
  const canProceed = item.type === "choice" ? selectedOption !== null : micDone;
  const progressPercent = Math.round((qIndex / state.items.length) * 100 + 10);
  const isLast = qIndex >= state.items.length - 1;

  return (
    <div className="w-full max-w-[640px] mt-[2vh]">
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
