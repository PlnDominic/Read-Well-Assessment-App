"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, MicIcon, SpeakerIcon } from "@/components/icons";
import { SunnyAvatar } from "@/components/SunnyAvatar";

interface KioskItem {
  id: string;
  skillAreaKey: string;
  type: "choice" | "mic" | "text";
  prompt: string;
  passage: string | null;
  options: string[] | null;
  expectedText?: string;
}

interface KioskState {
  status: "not_started" | "in_progress" | "completed";
  currentItemIndex: number;
  sessionCode?: string;
  studentName: string;
  assessmentGrade?: number;
  assessmentVersion?: number;
  items: KioskItem[];
  answersByItemId: Record<string, unknown>;
}

const PARTS = [
  { code: "LS", number: 1, title: "Letter sounds", subtitle: "Find the sounds hiding in letters", sitting: 1, color: "#0f766e" },
  { code: "SV", number: 2, title: "Short vowel words", subtitle: "Read the little words", sitting: 1, color: "#0f766e" },
  { code: "LC", number: 3, title: "Story listening", subtitle: "Listen like a story detective", sitting: 1, color: "#2563eb" },
  { code: "VO", number: 4, title: "Vocabulary", subtitle: "Match words to pictures", sitting: 1, color: "#2563eb" },
  { code: "CP", number: 5, title: "Print concepts", subtitle: "Explore how stories work", sitting: 1, color: "#2563eb" },
  { code: "SA", number: 6, title: "Sound awareness", subtitle: "Climb the sound ladder", sitting: 1, color: "#7c3aed" },
  { code: "BL", number: 7, title: "Blend sounds", subtitle: "Slide sounds together", sitting: 2, color: "#ea580c" },
  { code: "RW", number: 8, title: "Real blend words", subtitle: "Read words with blends", sitting: 2, color: "#ea580c" },
  { code: "NW", number: 9, title: "Made-up words", subtitle: "Be a word inventor", sitting: 2, color: "#ea580c" },
  { code: "HW", number: 10, title: "Heart words", subtitle: "Words you know by heart", sitting: 2, color: "#db2777" },
  { code: "ST", number: 11, title: "Story reading", subtitle: "Read a story aloud", sitting: 2, color: "#db2777" },
  { code: "AT", number: 12, title: "Reading attitude", subtitle: "Tell us how reading feels", sitting: 2, color: "#db2777" },
  { code: "WT", number: 13, title: "Writing", subtitle: "Show what you can write", sitting: 3, color: "#ca8a04" },
] as const;

function storageKey(prefix: string, id: string) { return `rw:${prefix}:${id}`; }
function readJson<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } }
function writeJson(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best effort */ } }
function partFor(item?: KioskItem) { return PARTS.find((part) => item?.id.toUpperCase().startsWith(part.code)) ?? PARTS[0]; }
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.86;
  window.speechSynthesis.speak(utterance);
}
function itemSpokenText(item: KioskItem) { return [item.passage, item.prompt].filter(Boolean).join(". "); }

export function StudentAssessmentRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<KioskState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [storySeconds, setStorySeconds] = useState(0);
  const pendingRef = useRef<Record<string, unknown>>({});
  const storyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pendingKey = storageKey("pending", sessionId);
  const stateKey = storageKey("state", sessionId);
  const pendingCompleteKey = storageKey("pendingComplete", sessionId);

  const applyState = useCallback((data: KioskState) => {
    const pending = readJson<Record<string, unknown>>(pendingKey, {});
    const cached = readJson<Partial<KioskState>>(stateKey, {});
    const merged = { ...data, answersByItemId: { ...data.answersByItemId, ...pending }, currentItemIndex: Math.max(data.currentItemIndex, cached.currentItemIndex ?? 0) };
    setState(merged);
    setStarted(merged.status !== "not_started" || Object.keys(merged.answersByItemId).length > 0);
    setQIndex(Math.min(merged.currentItemIndex, Math.max(merged.items.length - 1, 0)));
    writeJson(stateKey, merged);
  }, [pendingKey, stateKey]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/kiosk/sessions/${sessionId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("We couldn't find that assessment. Ask your teacher for a new code.");
      applyState(await response.json() as KioskState);
      setIsOnline(true);
    } catch (err) {
      const cached = readJson<KioskState | null>(stateKey, null);
      if (cached) { applyState(cached); setIsOnline(false); }
      else setError(err instanceof Error ? err.message : "This assessment could not be loaded.");
    }
  }, [applyState, sessionId, stateKey]);

  useEffect(() => {
    // Browser-only session bootstrapping happens after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);
    setSpeechSupported(typeof window.speechSynthesis !== "undefined");
    pendingRef.current = readJson<Record<string, unknown>>(pendingKey, {});
    load();
  }, [load, pendingKey]);

  const item = state?.items[qIndex];
  const part = partFor(item);
  const isLevel2 = state?.assessmentGrade === 2 || state?.assessmentVersion === 2 || state?.items.some((entry) => /^(LS|SV|LC|VO|CP|SA|BL|RW|NW|HW|ST|AT|WT)/i.test(entry.id));
  const savedAnswer = item ? state?.answersByItemId[item.id] : undefined;
  const savedString = typeof savedAnswer === "string" ? savedAnswer : "";
  const partIndex = Math.max(0, PARTS.findIndex((candidate) => candidate.code === part.code));
  const partProgress = isLevel2 ? Math.round(((partIndex + 1) / PARTS.length) * 100) : Math.round(((qIndex + 1) / (state?.items.length || 1)) * 100);
  const isStory = item?.id.toUpperCase().startsWith("ST");

  useEffect(() => {
    if (!started || !item || !isStory || state?.status === "completed") return;
    // The timer resets when the learner reaches a new story item.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorySeconds(0);
    storyTimerRef.current = setInterval(() => setStorySeconds((seconds) => seconds + 1), 1000);
    return () => { if (storyTimerRef.current) clearInterval(storyTimerRef.current); };
  }, [item, isStory, started, state?.status]);

  useEffect(() => {
    if (started && item && speechSupported) speak(itemSpokenText(item));
    return () => window.speechSynthesis?.cancel();
  }, [item, started, speechSupported]);

  const flushPending = useCallback(async () => {
    const entries = Object.entries(pendingRef.current);
    if (!entries.length) return true;
    setSyncing(true);
    let ok = true;
    for (const [itemId, answer] of entries) {
      try {
        const response = await fetch(`/api/kiosk/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, answer }) });
        if (response.ok) delete pendingRef.current[itemId]; else ok = false;
      } catch { ok = false; }
    }
    writeJson(pendingKey, pendingRef.current);
    setSyncing(false);
    return ok;
  }, [pendingKey, sessionId]);

  const complete = useCallback(async () => {
    if (!(await flushPending())) return false;
    try {
      const response = await fetch(`/api/kiosk/sessions/${sessionId}/complete`, { method: "POST" });
      if (!response.ok) return false;
      setState((current) => current ? { ...current, status: "completed" } : current);
      localStorage.removeItem(pendingCompleteKey);
      return true;
    } catch { return false; }
  }, [flushPending, pendingCompleteKey, sessionId]);

  useEffect(() => {
    const online = () => { setIsOnline(true); flushPending(); if (localStorage.getItem(pendingCompleteKey)) complete(); };
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    const interval = setInterval(flushPending, 6000);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); clearInterval(interval); };
  }, [complete, flushPending, pendingCompleteKey]);

  function saveAnswer(answer: unknown) {
    if (!item) return;
    pendingRef.current[item.id] = answer;
    writeJson(pendingKey, pendingRef.current);
    setState((current) => {
      if (!current) return current;
      const next = { ...current, answersByItemId: { ...current.answersByItemId, [item.id]: answer }, currentItemIndex: Math.max(current.currentItemIndex, qIndex + 1) };
      writeJson(stateKey, next);
      return next;
    });
    flushPending();
  }

  function recordMic() {
    if (savedString || recording) return;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) { setRecording(true); setTimeout(() => { setRecording(false); saveAnswer("attempted"); }, 1000); return; }
    const recognition = new Recognition();
    recognition.lang = "en-US"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    setRecording(true);
    recognition.onresult = (event) => saveAnswer(event.results[0]?.[0]?.transcript ?? "attempted");
    recognition.onerror = () => saveAnswer("attempted");
    recognition.onend = () => setRecording(false);
    recognition.start();
  }

  async function next() {
    if (!state || !item) return;
    if (qIndex < state.items.length - 1) { setQIndex((index) => index + 1); return; }
    setCompleting(true);
    const ok = await complete();
    setCompleting(false);
    if (!ok) localStorage.setItem(pendingCompleteKey, "1");
  }

  if (error) return <div className="rw-assessment-shell"><div className="rw-message-card"><SunnyAvatar size={92} /><h1>Let&apos;s try again</h1><p>{error}</p><button className="rw-primary" onClick={load}>Try again</button></div></div>;
  if (!state) return <div className="rw-assessment-shell"><div className="rw-loading">Loading Sunny&apos;s reading quest…</div></div>;
  if (state.status === "completed") return <div className="rw-assessment-shell"><div className="rw-message-card"><div className="rw-success-orb"><CheckIcon /></div><h1>Quest complete!</h1><p>You worked very hard today. Go tell your teacher you finished.</p><button className="rw-primary" onClick={() => router.push("/login")}>Finish</button></div></div>;
  if (!item) return <div className="rw-assessment-shell"><div className="rw-message-card"><h1>Assessment ready</h1><p>Your teacher hasn&apos;t added the Level 2 questions yet.</p></div></div>;

  const canProceed = item && (item.type === "choice" ? !!savedString : item.type === "text" ? savedString.trim().length > 0 : !!savedString);
  const firstInPart = qIndex === 0 || partFor(state.items[qIndex - 1]).code !== part.code;
  const sittingLabel = part.sitting === 1 ? "First sitting" : part.sitting === 2 ? "Second sitting" : "Writing time";

  if (!started) return <div className="rw-assessment-shell"><div className="rw-welcome-card"><SunnyAvatar size={138} /><div className="rw-eyebrow">{isLevel2 ? "LEVEL 2 · FORM A" : "READ WELL ASSESSMENT"}</div><h1>Ready for a reading quest?</h1><p>Hi, {state.studentName.split(" ")[0]}! We&apos;ll explore sounds, words, stories and writing together. There are no wrong answers — just try your best.</p><button className="rw-primary rw-start" onClick={() => { setStarted(true); if (item && speechSupported) speak(itemSpokenText(item)); }}>Let&apos;s start <span>→</span></button><div className="rw-quest-note">13 mini-missions · 2 short sittings · lots of high fives</div></div></div>;

  return <div className="rw-assessment-shell">
    {!isOnline && <div className="rw-offline-banner">You&apos;re offline — your answers are safe on this device.</div>}
    <div className="rw-quest-header"><div><div className="rw-brand"><span className="rw-brand-dot">✦</span> Read Well</div><div className="rw-header-sub">{isLevel2 ? "Level 2 reading quest" : "Reading quest"}</div></div><div className="rw-header-score"><span className="rw-spark">✦</span> Mission {isLevel2 ? `${part.number} of 13` : `${qIndex + 1} of ${state.items.length}`}</div></div>
    <div className="rw-progress-track"><div className="rw-progress-fill" style={{ width: `${partProgress}%` }} /></div>
    <div className="rw-sitting-row"><span className="rw-sitting-pill">{sittingLabel}</span><span>{firstInPart ? "New mission" : "Keep going!"}</span>{syncing && <span className="rw-saving">Saving…</span>}</div>
    <main className="rw-mission-card">
      <div className="rw-mission-top"><div className="rw-part-badge" style={{ background: part.color }}>PART {part.number} · {part.code}</div>{speechSupported && <button className="rw-listen" onClick={() => speak(itemSpokenText(item))}><SpeakerIcon size={17} /> Listen</button>}</div>
      {firstInPart && <div className="rw-part-intro"><strong>{part.title}</strong><span>{part.subtitle}</span></div>}
      {item.passage && <div className="rw-passage">{item.passage}</div>}
      <h1 className="rw-prompt">{item.prompt}</h1>
      {isStory && <div className="rw-timer"><span className="rw-timer-dot" /> Story time {Math.floor(storySeconds / 60)}:{String(storySeconds % 60).padStart(2, "0")}</div>}
      {item.type === "choice" && item.options && <div className="rw-options">{item.options.map((option) => <button key={option} className={`rw-option ${savedString === option ? "selected" : ""}`} onClick={() => saveAnswer(option)}><span className="rw-option-letter">{String.fromCharCode(65 + item.options!.indexOf(option))}</span>{option}{savedString === option && <span className="rw-check">✓</span>}</button>)}</div>}
      {item.type === "text" && <textarea className="rw-writing-input" value={savedString} onChange={(event) => saveAnswer(event.target.value)} placeholder="Write your answer here…" rows={3} autoFocus />}
      {item.type === "mic" && <div className="rw-mic-wrap"><button className={`rw-mic ${savedString ? "done" : recording ? "recording" : ""}`} onClick={recordMic} aria-label="Read aloud"><MicIcon /></button><strong>{savedString ? "Nice reading! ✓" : recording ? "Sunny is listening…" : "Tap to read aloud"}</strong><small>Take your time. You can try once.</small></div>}
    </main>
    <div className="rw-actions"><span className="rw-encouragement">{canProceed ? "Great work! Ready for the next one?" : "Take your time — you can do it."}</span>{canProceed && <button className="rw-primary" onClick={next} disabled={completing}>{completing ? "Finishing…" : qIndex === state.items.length - 1 ? "Finish quest ✓" : "Next mission →"}</button>}</div>
  </div>;
}
