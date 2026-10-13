"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MicIcon, SpeakerIcon } from "@/components/icons";
import { AnimatedSunny, SUNNY_FACE_SRC, type SunnyMood } from "@/components/AnimatedSunny";
import { burst, originOf, playSound, setSoundEnabled, soundEnabled } from "@/lib/gameFx";
import { optionPicture, type OptionPicture } from "@/lib/optionPicture";
import { REACTION_LINES, itemSpokenText } from "@/lib/spoken";
import { canSpeak, sayAloud, stopSpeaking } from "@/lib/voice";
import { MISSION_SIZE, partFor, partsFor, type Part } from "@/lib/gameParts";
import { isWordCard, showAsTiles } from "@/lib/gameLayout";
import { stopReachedAt } from "@/lib/gameStop";

interface KioskItem {
  id: string;
  skillAreaKey: string;
  type: "choice" | "mic" | "text";
  prompt: string;
  passage: string | null;
  /** What Sunny says instead of reading the prompt; never shown. */
  say: string | null;
  options: string[] | null;
}

interface KioskState {
  status: "not_started" | "in_progress" | "completed";
  currentItemIndex: number;
  sessionCode?: string;
  studentName: string;
  assessmentLevel?: number;
  assessmentForm?: "A" | "B" | "C" | "Final" | null;
  assessmentVersion?: number;
  items: KioskItem[];
  answersByItemId: Record<string, unknown>;
}

/**
 * The game is split into missions: one per ReadWell part when the items
 * carry part codes (the Level 2 quest), otherwise every MISSION_SIZE
 * questions. Stars reward effort, one per question answered, never
 * correctness: the child mustn't be able to tell right from wrong, or the
 * assessment stops measuring what they know.
 */
const MISSION_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#c2410c", "#be185d", "#a16207"];
/** How long a tapped choice stays on screen, with its star and Sunny's cheer, before the next question. */
const AUTO_NEXT_MS = 1500;
const PRAISE = ["Nice work!", "Super!", "You did it!", "Awesome!", "Way to go!", "High five!", "You're a star!", "Brilliant!"];

interface Mission {
  key: string;
  title: string;
  subtitle: string;
  color: string;
  /** The ReadWell sitting (1, 2, or 3 for writing); null for forms without parts. */
  sitting: number | null;
  partLabel: string | null;
  /** Item indexes [start, end). */
  start: number;
  end: number;
}

function storageKey(prefix: string, id: string) { return `rw:${prefix}:${id}`; }
function readJson<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } }
function writeJson(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best effort */ } }
function isAnswered(answer: unknown) { return typeof answer === "string" ? answer.trim().length > 0 : answer !== undefined && answer !== null; }
// What a read-aloud item records when the child skips it; scored as wrong (evaluateResponse in src/lib/kiosk.ts).
const SKIPPED = "skipped";
/** What a read-aloud item records when the mic heard nothing twice; scored as wrong (kiosk.ts). */
const NO_SPEECH = "nospeech";
/** How many guesses to ask the recognizer for; all of them are sent, best first (kiosk.ts HEARD_SEPARATOR). */
const HEARD_GUESSES = 5;
const HEARD_SEPARATOR = " | ";
/** An answer that earns a star: anything but a skip. */
function earnsStar(answer: unknown) { return isAnswered(answer) && answer !== SKIPPED; }

/** An option's picture, falling back to the emoji itself if the file is missing. */
function OptionImage({ picture, tile }: { picture: OptionPicture; tile: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!picture.src || failed) return picture.emoji ? <span className={tile ? "rw-tile-emoji" : "rw-option-emoji"}>{picture.emoji}</span> : null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={picture.src} alt="" draggable={false} className={tile ? "rw-tile-img" : "rw-option-img"} onError={() => setFailed(true)} />;
}

function buildMissions(items: KioskItem[], parts: Part[]): Mission[] {
  const byPart = items.length > 0 && items.every((item) => partFor(parts, item));
  const missions: Mission[] = [];
  items.forEach((item, index) => {
    const part = partFor(parts, item) ?? parts[0];
    // A part's mission is shared with its neighbour in the same sitting (gameParts.ts).
    const key = byPart ? part.mission.key : String(Math.floor(index / MISSION_SIZE));
    const last = missions[missions.length - 1];
    if (last && last.key === key) { last.end = index + 1; return; }
    const n = missions.length;
    missions.push(byPart
      ? { key, title: part.mission.title, subtitle: part.mission.subtitle, color: part.color, sitting: part.sitting, partLabel: `PART ${part.number} · ${part.code}`, start: index, end: index + 1 }
      : { key, title: `Mission ${n + 1}`, subtitle: "", color: MISSION_COLORS[n % MISSION_COLORS.length], sitting: null, partLabel: null, start: index, end: index + 1 });
  });
  for (const m of missions) if (!m.partLabel) m.subtitle = `${m.end - m.start} question${m.end - m.start === 1 ? "" : "s"}`;
  return missions;
}

/** The path of missions across a little sky, with Sunny's face at the current one. */
/** True when a mission ends a ReadWell sitting, so the child can stop there for the day. */
function endsSitting(missions: Mission[], i: number) {
  const next = missions[i + 1];
  return !!next && missions[i].sitting !== null && next.sitting !== null && next.sitting !== missions[i].sitting;
}

function QuestMap({ missions, current, children }: { missions: Mission[]; current: number; children?: ReactNode }) {
  const stops = missions.length + 1; // the trophy at the end
  const at = (i: number) => ((Math.min(i, stops - 1) + 0.5) / stops) * 100;
  return (
    <div className="rw-map">
      <span className="rw-cloud" aria-hidden="true" /><span className="rw-cloud c2" aria-hidden="true" /><span className="rw-cloud c3" aria-hidden="true" />
      <div className={`rw-path ${missions.some((_, i) => endsSitting(missions, i)) ? "has-stops" : ""}`} role="img" aria-label={current >= missions.length ? "Every mission done" : `Quest map: mission ${current + 1} of ${missions.length}`} style={{ gridTemplateColumns: `repeat(${stops}, 1fr)` }}>
        <div className="rw-path-line" style={{ left: `${at(0)}%`, right: `${100 - at(stops - 1)}%` }} />
        <div className="rw-path-fill" style={{ left: `${at(0)}%`, width: `${at(current) - at(0)}%` }} />
        {missions.map((m, i) => (
          <span key={m.key + i} className={`rw-node ${i < current ? "done" : i === current ? "current" : ""}`} style={{ "--node-color": m.color } as CSSProperties}>
            {i < current ? "★" : ""}
          </span>
        ))}
        {missions.map((m, i) => endsSitting(missions, i) && (
          <span key={`stop${i}`} className={`rw-stop-flag ${i < current ? "passed" : ""}`} style={{ left: `${at(i)}%` }}>Stop here</span>
        ))}
        <span className="rw-node goal">🏆</span>
        <div className="rw-map-face" style={{ left: `${at(current)}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={current} src={SUNNY_FACE_SRC} alt="" />
        </div>
      </div>
      {children && <div className="rw-map-caption">{children}</div>}
    </div>
  );
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
  const [isOnline, setIsOnline] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [storySeconds, setStorySeconds] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  /** The mission just finished, while its celebration is showing. */
  const [celebrating, setCelebrating] = useState<number | null>(null);
  const [starBump, setStarBump] = useState(0);
  /** The mic heard nothing on the first go; the child is asked to try once more. */
  const [heardNothingFor, setHeardNothingFor] = useState<string | null>(null);
  /** Goes the child has had at each read-aloud question. */
  const micTriesRef = useRef<Record<string, number>>({});
  /** Where the server said to go after a question, when it ended a part early (see `skipsRef`). */
  const [skips, setSkips] = useState<Record<string, number>>({});
  const pendingRef = useRef<Record<string, unknown>>({});
  const storyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const starsRef = useRef<HTMLSpanElement>(null);
  const finishCelebrated = useRef(false);
  /** The move to the next question after a choice is tapped (see choose). */
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Where the server says to go after a question, when it ended a part early
   * (the stop rule, src/lib/gameStop.ts): item id to the index to jump to.
   * A ref mirroring `skips`, because the auto-advance timer must see a skip
   * that arrived after it was set. Never says why; the child just meets the
   * next mission.
   */
  const skipsRef = useRef<Record<string, number>>({});
  /**
   * Where the stop rule sends the child after question `index`, as far as this
   * device can tell by itself: the server alone knows which answers were right,
   * so this only sees a run of "I can't read this one yet" taps (wrong for
   * certain) and treats every other answer as possibly right. That is the
   * clearest case of a part a child can't do yet, and it works with no
   * connection; the server's rule (the `skipTo` it replies with) covers the rest.
   */
  function stopOnDevice(index: number): number | null {
    if (!state) return null;
    const known = new Map<string, boolean>();
    for (const entry of state.items) {
      const answer = state.answersByItemId[entry.id];
      if (isAnswered(answer)) known.set(entry.id, answer !== SKIPPED && answer !== NO_SPEECH);
    }
    return stopReachedAt(state.items, partsFor(state.assessmentLevel), known, index)?.resumeAt ?? null;
  }
  /** Where the quest picks up when the mission celebration is dismissed. */
  const resumeAtRef = useRef<number | null>(null);

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
    setSpeechSupported(canSpeak());
    setSoundOn(soundEnabled());
    pendingRef.current = readJson<Record<string, unknown>>(pendingKey, {});
    load();
  }, [load, pendingKey]);

  const item = state?.items[qIndex];
  const missions = state ? buildMissions(state.items, partsFor(state.assessmentLevel)) : [];
  const missionIndexOf = (index: number) => Math.max(0, missions.findIndex((m) => index >= m.start && index < m.end));
  const missionIndex = missionIndexOf(qIndex);
  const mission = missions[missionIndex];
  const savedAnswer = item ? state?.answersByItemId[item.id] : undefined;
  const savedString = typeof savedAnswer === "string" ? savedAnswer : "";
  const isStory = item?.type === "mic" && item.id.toUpperCase().startsWith("ST");
  const stars = state ? state.items.filter((entry) => earnsStar(state.answersByItemId[entry.id])).length : 0;

  useEffect(() => {
    if (!started || !item || !isStory || state?.status === "completed") return;
    // The timer resets when the learner reaches a new story item.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorySeconds(0);
    storyTimerRef.current = setInterval(() => setStorySeconds((seconds) => seconds + 1), 1000);
    return () => { if (storyTimerRef.current) clearInterval(storyTimerRef.current); };
  }, [item, isStory, started, state?.status]);

  useEffect(() => {
    if (started && item && speechSupported) sayAloud(itemSpokenText(item));
    return () => stopSpeaking();
  }, [item, started, speechSupported]);

  // The big finish, once per visit to the finished screen.
  useEffect(() => {
    if (state?.status !== "completed" || finishCelebrated.current) return;
    finishCelebrated.current = true;
    playSound("quest");
    burst("quest");
  }, [state?.status]);

  const flushPending = useCallback(async () => {
    const entries = Object.entries(pendingRef.current);
    if (!entries.length) return true;
    setSyncing(true);
    let ok = true;
    for (const [itemId, answer] of entries) {
      try {
        const response = await fetch(`/api/kiosk/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, answer }) });
        if (response.ok) {
          delete pendingRef.current[itemId];
          const { skipTo } = await response.json().catch(() => ({})) as { skipTo?: unknown };
          if (typeof skipTo === "number") { skipsRef.current = { ...skipsRef.current, [itemId]: skipTo }; setSkips(skipsRef.current); }
        } else ok = false;
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
    const firstAnswer = !earnsStar(state?.answersByItemId[item.id]) && earnsStar(answer);
    pendingRef.current[item.id] = answer;
    writeJson(pendingKey, pendingRef.current);
    setState((current) => {
      if (!current) return current;
      const next = { ...current, answersByItemId: { ...current.answersByItemId, [item.id]: answer }, currentItemIndex: Math.max(current.currentItemIndex, qIndex + 1) };
      writeJson(stateKey, next);
      return next;
    });
    flushPending();
    // The same star for every answer, right or wrong: the child is never
    // told which, so the assessment measures what they know.
    if (firstAnswer) {
      playSound("star");
      burst("star", originOf(starsRef.current));
      setStarBump((n) => n + 1);
    } else if (item.type === "choice" || answer === SKIPPED) {
      playSound("tap");
    }
  }

  function recordMic() {
    if (savedString || recording || !item) return;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) { setRecording(true); setTimeout(() => { setRecording(false); saveAnswer("attempted"); }, 1000); return; }
    const recognition = new Recognition();
    // The device's own English (en-GB, en-NG, en-GH...) hears a local accent better than en-US.
    recognition.lang = /^en\b/i.test(navigator.language) ? navigator.language : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = HEARD_GUESSES;
    setRecording(true);
    setHeardNothingFor(null);
    let finished = false;
    const heardNothingNow = () => {
      if (finished) return;
      finished = true;
      // Silence isn't a try: the child gets one more go, then it's scored as a miss.
      const tries = (micTriesRef.current[item.id] ?? 0) + 1;
      micTriesRef.current[item.id] = tries;
      if (tries < 2) setHeardNothingFor(item.id);
      else saveAnswer(NO_SPEECH);
    };
    recognition.onresult = (event) => {
      const guesses = Array.from(event.results[0] ?? [], (alt) => alt.transcript.trim()).filter(Boolean);
      if (guesses.length === 0) return heardNothingNow();
      finished = true;
      saveAnswer([...new Set(guesses)].join(HEARD_SEPARATOR));
    };
    recognition.onerror = (event) => {
      // No speech: not a failure of the mic. Anything else (no permission, no
      // network) means this device can't listen, and the read-aloud counts as tried.
      if (event.error === "no-speech" || event.error === "aborted") heardNothingNow();
      else if (!finished) { finished = true; saveAnswer("attempted"); }
    };
    recognition.onend = () => { setRecording(false); heardNothingNow(); };
    recognition.start();
  }

  async function next() {
    if (!state || !item) return;
    // The next question, or past the end of a part the stop rule ended early.
    const target = skipsRef.current[item.id] ?? stopOnDevice(qIndex) ?? qIndex + 1;
    if (target < state.items.length) {
      if (missionIndexOf(target) !== missionIndex) {
        resumeAtRef.current = target;
        setCelebrating(missionIndex);
        playSound("mission");
        burst("mission");
        if (speechSupported) sayAloud(REACTION_LINES.missionComplete);
        return;
      }
      setQIndex(target);
      return;
    }
    setCompleting(true);
    const ok = await complete();
    setCompleting(false);
    if (!ok) localStorage.setItem(pendingCompleteKey, "1");
  }

  /**
   * A tap on a choice: it's saved, the star and Sunny's cheer play (the same
   * for any answer), and the game moves on by itself a moment later, so a
   * child is never left waiting on a wrong pick. A second tap in that moment
   * changes the answer and restarts the wait. The last question waits for
   * Finish instead.
   */
  function choose(option: string) {
    if (!state || !item) return;
    saveAnswer(option);
    if (autoNextRef.current) clearTimeout(autoNextRef.current);
    if ((skipsRef.current[item.id] ?? stopOnDevice(qIndex) ?? qIndex + 1) < state.items.length) autoNextRef.current = setTimeout(next, AUTO_NEXT_MS);
  }

  // A question change (by the timer or the Next button) cancels a pending move.
  useEffect(() => () => {
    if (autoNextRef.current) clearTimeout(autoNextRef.current);
  }, [qIndex]);

  function continueQuest() {
    setCelebrating(null);
    setQIndex((index) => resumeAtRef.current ?? index + 1);
    resumeAtRef.current = null;
  }

  function toggleSound() {
    const on = !soundOn;
    setSoundEnabled(on);
    setSoundOn(on);
    if (on) playSound("tap");
  }

  const firstName = state?.studentName.split(" ")[0] ?? "";

  if (error) return <div className="rw-assessment-shell"><div className="rw-message-card"><AnimatedSunny mood="think" size={130} className="rw-celebrate-sunny" /><h1>Let&apos;s try again</h1><p>{error}</p><button className="rw-primary" onClick={load}>Try again</button></div></div>;
  if (!state) return <div className="rw-assessment-shell"><div className="rw-loading"><AnimatedSunny mood="read" size={110} className="rw-celebrate-sunny" />Loading Sunny&apos;s reading quest…</div></div>;
  if (state.status === "completed") return (
    <div className="rw-assessment-shell">
      {missions.length > 0 && <QuestMap missions={missions} current={missions.length} />}
      <div className="rw-celebrate-card">
        <AnimatedSunny mood="trophy" size={180} say={firstName ? `You did it, ${firstName}!` : "You did it!"} className="rw-celebrate-sunny" />
        <h1>Quest complete!</h1>
        <div className="rw-badge" aria-label={`${stars} stars earned`}><strong>⭐ {stars}</strong><small>Reading star</small></div>
        {missions.length > 1 && (
          <div className="rw-stamps" aria-hidden="true">
            {missions.map((m, i) => <span key={m.key + i} className="rw-stamp" style={{ "--node-color": m.color, animationDelay: `${300 + i * 70}ms` } as CSSProperties}>★</span>)}
          </div>
        )}
        <p>You worked very hard today. Go tell your teacher you finished.</p>
        <button className="rw-primary" onClick={() => router.push("/login")}>Finish</button>
      </div>
    </div>
  );
  if (!item || !mission) return <div className="rw-assessment-shell"><div className="rw-message-card"><AnimatedSunny mood="think" size={130} className="rw-celebrate-sunny" /><h1>Assessment ready</h1><p>Your teacher hasn&apos;t added the questions yet.</p></div></div>;

  const questName = state.assessmentLevel ? `Level ${state.assessmentLevel} reading quest` : "Reading quest";
  const sittings = new Set(missions.map((m) => m.sitting).filter((s) => s !== null && s < 3)).size;

  if (!started) return (
    <div className="rw-assessment-shell">
      <div className="rw-welcome-card">
        <AnimatedSunny mood="wave" size={170} say={`Hi, ${firstName}!`} className="rw-celebrate-sunny" />
        <div className="rw-eyebrow">{state.assessmentLevel ? `LEVEL ${state.assessmentLevel}${state.assessmentForm ? ` · ${state.assessmentForm === "Final" ? "FINAL" : `FORM ${state.assessmentForm}`}` : ""}` : "READ WELL ASSESSMENT"}</div>
        <h1>Ready for a reading quest?</h1>
        <p>We&apos;ll explore sounds, words, stories and writing together. There are no wrong answers. Just try your best!</p>
        <button className="rw-primary rw-start" onClick={() => { setStarted(true); playSound("tap"); if (item && speechSupported) sayAloud(itemSpokenText(item)); }}>Let&apos;s start <span>→</span></button>
        <div className="rw-quest-note">
          {missions.length} mini-mission{missions.length === 1 ? "" : "s"}
          {sittings > 1 ? ` · ${sittings} short sittings` : ""} · a star for every answer
        </div>
      </div>
    </div>
  );

  if (celebrating !== null) {
    const done = missions[celebrating];
    const upNext = missions[celebrating + 1];
    const earned = state.items.slice(done.start, done.end).filter((entry) => earnsStar(state.answersByItemId[entry.id])).length;
    const breakTime = endsSitting(missions, celebrating);
    return (
      <div className="rw-assessment-shell">
        <QuestMap missions={missions} current={celebrating + 1} />
        <div className="rw-celebrate-card">
          <AnimatedSunny mood="cheer" size={160} say="Mission complete!" className="rw-celebrate-sunny" />
          <div className="rw-eyebrow">MISSION {celebrating + 1} OF {missions.length}</div>
          <h1>{done.title}: done!</h1>
          <div className="rw-earned" role="img" aria-label={`${earned} stars`}>
            {Array.from({ length: Math.min(earned, 10) }, (_, i) => <span key={i} style={{ animationDelay: `${150 + i * 90}ms` }}>⭐</span>)}
          </div>
          {breakTime && <div className="rw-break-note"><span className="rw-stop-here">✋ Stop here</span>Great work! Time for a little break. Your teacher will tell you when to start the next part.</div>}
          {upNext && <p>Next up: <strong>{upNext.title}</strong>{upNext.partLabel ? ` · ${upNext.subtitle}` : ""}</p>}
          <button className="rw-primary rw-start" onClick={continueQuest} autoFocus>{breakTime ? "Teacher says go on" : "Next mission"} <span>→</span></button>
        </div>
      </div>
    );
  }

  const canProceed = item.type === "choice" ? !!savedString : item.type === "text" ? savedString.trim().length > 0 : !!savedString;
  const pictures = (item.options ?? []).map(optionPicture);
  const tiles = showAsTiles(pictures);
  const wordCard = isWordCard(item);
  // The part this question is in, and whether it opens a part (a mission can hold two).
  const part = partFor(partsFor(state.assessmentLevel), item);
  const previousPart = qIndex > 0 ? partFor(partsFor(state.assessmentLevel), state.items[qIndex - 1]) : undefined;
  const firstInPart = !!part && part !== previousPart;
  // A part the stop rule ended early has nothing left in it, whatever the form holds.
  const nextIndex = skips[item.id] ?? stopOnDevice(qIndex) ?? qIndex + 1;
  const leftInMission = nextIndex > mission.end - 1 ? 0 : mission.end - nextIndex;
  const lastQuestion = nextIndex >= state.items.length;
  const sittingLabel = mission.sitting === 1 ? "First sitting" : mission.sitting === 2 ? "Second sitting" : "Writing time";

  let mood: SunnyMood;
  let say: string;
  if (recording) { mood = "listen"; say = "I'm listening…"; }
  else if (savedString === SKIPPED || savedString === NO_SPEECH) { mood = "thumbs"; say = "That's okay! On to the next one."; }
  else if (item.type === "text" && canProceed) { mood = "thumbs"; say = "Looking good! Tap Next when you're done."; }
  else if (canProceed) { mood = qIndex % 2 ? "cheer" : "thumbs"; say = PRAISE[qIndex % PRAISE.length]; }
  else if (item.type === "mic") { mood = "read"; say = isStory ? "Read the story to me!" : "Tap the mic and read to me!"; }
  else if (item.type === "text") { mood = "think"; say = "Write it your way!"; }
  else { mood = "think"; say = "Which one do you think?"; }

  return <div className="rw-assessment-shell">
    {!isOnline && <div className="rw-offline-banner">You&apos;re offline — your answers are safe on this device.</div>}
    <div className="rw-quest-header">
      <div><div className="rw-brand"><span className="rw-brand-dot">✦</span> Read Well</div><div className="rw-header-sub">{questName}</div></div>
      <div className="rw-hud">
        <span ref={starsRef} key={starBump} className={`rw-stars ${starBump ? "bump" : ""}`} aria-label={`${stars} stars`}><span className="rw-stars-icon" aria-hidden="true">⭐</span>{stars}</span>
        <button className={`rw-sound ${soundOn ? "" : "off"}`} onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "Turn sounds off" : "Turn sounds on"}><SpeakerIcon size={17} color="currentColor" /></button>
      </div>
    </div>
    <QuestMap missions={missions} current={missionIndex}>
      {mission.sitting !== null && <span className="rw-map-pill" style={{ background: mission.color }}>{sittingLabel}</span>}
      <span>Mission {missionIndex + 1} of {missions.length}{mission.partLabel ? ` · ${mission.title}` : ""}</span>
      {syncing && <span className="rw-saving">Saving…</span>}
    </QuestMap>
    <div className="rw-stage">
      <AnimatedSunny mood={mood} size={120} say={say} peek className="rw-stage-sunny" />
      <main className="rw-mission-card">
        <div className="rw-mission-top"><div className="rw-part-badge" style={{ background: part?.color ?? mission.color }}>{part ? `PART ${part.number} · ${part.code}` : `MISSION ${missionIndex + 1}`}</div>{speechSupported && <button className="rw-listen" onClick={() => sayAloud(itemSpokenText(item))}><SpeakerIcon size={17} color="currentColor" /> Listen</button>}</div>
        {firstInPart && part && <div className="rw-part-intro"><strong>{part.title}</strong><span>{part.subtitle}</span></div>}
        {!part && qIndex === mission.start && <div className="rw-part-intro"><strong>{mission.title}</strong><span>{mission.subtitle}</span></div>}
        {item.passage && (wordCard
          ? <div className="rw-word-card">{item.passage}</div>
          : <div className={`rw-passage ${item.type === "mic" ? "rw-passage-read" : ""}`}>{item.passage}</div>)}
        <h1 className="rw-prompt">{item.prompt}</h1>
        {item.say && speechSupported && <p className="rw-say-hint">Tap Listen to hear Sunny again.</p>}
        {isStory && <div className="rw-timer"><span className="rw-timer-dot" /> Story time {Math.floor(storySeconds / 60)}:{String(storySeconds % 60).padStart(2, "0")}</div>}
        {item.type === "choice" && item.options && (
          <div className={`rw-options ${tiles ? `rw-tiles${item.options.length === 4 ? " four" : ""}` : ""}`} style={tiles ? { "--cols": Math.min(item.options.length, 4) } as CSSProperties : undefined}>
            {item.options.map((option, i) => {
              const picture = pictures[i];
              const selected = savedString === option;
              return (
                <button key={option} className={`rw-option ${tiles ? "rw-tile" : ""} ${selected ? "selected" : ""}`} onClick={() => choose(option)} aria-label={tiles && picture.src ? `Choice ${i + 1}` : undefined} aria-pressed={selected}>
                  {!tiles && <span className="rw-option-letter">{String.fromCharCode(65 + i)}</span>}
                  <OptionImage picture={picture} tile={tiles} />
                  {tiles ? !picture.src && <span className="rw-tile-glyph">{picture.label}</span> : <span>{picture.label}</span>}
                  {selected && <span className="rw-check">✓</span>}
                </button>
              );
            })}
          </div>
        )}
        {item.type === "text" && <textarea className="rw-writing-input" value={savedString} onChange={(event) => saveAnswer(event.target.value)} placeholder="Write your answer here…" rows={3} autoFocus />}
        {item.type === "mic" && <div className="rw-mic-wrap"><button className={`rw-mic ${savedString ? "done" : recording ? "recording" : ""}`} onClick={recordMic} aria-label="Read aloud"><MicIcon /></button><strong>{savedString === SKIPPED ? "Skipped" : savedString === NO_SPEECH ? "That's okay!" : savedString ? "Nice reading! ✓" : recording ? "Sunny is listening…" : heardNothingFor === item.id ? "I didn't hear you. Tap and try again!" : "Tap to read aloud"}</strong><small>Take your time. Speak up so Sunny can hear.</small>{!savedString && !recording && <button className="rw-skip" onClick={() => saveAnswer(SKIPPED)}>I can&apos;t read this one yet</button>}</div>}
      </main>
    </div>
    <div className="rw-actions">
      <span className="rw-encouragement">{lastQuestion ? "Last one. You're almost there!" : leftInMission === 0 ? "Last one in this mission!" : `${leftInMission} more in this mission`}</span>
      {canProceed && <button className="rw-primary" onClick={next} disabled={completing}>{completing ? "Finishing…" : lastQuestion ? "Finish quest ✓" : leftInMission === 0 ? "Finish mission ★" : "Next →"}</button>}
    </div>
  </div>;
}
