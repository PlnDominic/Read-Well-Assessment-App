"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MicIcon, SpeakerIcon } from "@/components/icons";
import { AnimatedSunny, SUNNY_FACE_SRC, type SunnyMood } from "@/components/AnimatedSunny";
import { burst, originOf, playSound, setSoundEnabled, soundEnabled } from "@/lib/gameFx";
import { optionPicture, type OptionPicture } from "@/lib/optionPicture";

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

interface Part {
  code: string;
  number: number;
  title: string;
  subtitle: string;
  /** The ReadWell sitting: 1, 2, or 3 for the writing. */
  sitting: number;
  color: string;
}

// Each level's parts, in order, by the item-code prefix its game items use.
const LEVEL_PARTS: Record<number, Part[]> = {
  1: [
    { code: "LC", number: 1, title: "Story listening", subtitle: "Listen to Sunny's story", sitting: 1, color: "#2563eb" },
    { code: "VO", number: 2, title: "Vocabulary", subtitle: "Find the picture", sitting: 1, color: "#2563eb" },
    { code: "CP", number: 3, title: "Print concepts", subtitle: "Show how books work", sitting: 1, color: "#2563eb" },
    { code: "SA", number: 4, title: "Sound awareness", subtitle: "Play with sounds", sitting: 1, color: "#7c3aed" },
    { code: "LN", number: 5, title: "Letter names", subtitle: "Find the letters", sitting: 1, color: "#0f766e" },
    { code: "LS", number: 6, title: "Letter sounds", subtitle: "Match sounds to letters", sitting: 1, color: "#0f766e" },
    { code: "CV", number: 7, title: "CV blending", subtitle: "Slide two sounds together", sitting: 2, color: "#ea580c" },
    { code: "RW", number: 8, title: "Real words", subtitle: "Read the little words", sitting: 2, color: "#ea580c" },
    { code: "NW", number: 9, title: "Made up words", subtitle: "Be a word inventor", sitting: 2, color: "#ea580c" },
    { code: "HW", number: 10, title: "Heart words", subtitle: "Words you know by heart", sitting: 2, color: "#db2777" },
    { code: "ST", number: 11, title: "Story reading", subtitle: "Read a story aloud", sitting: 2, color: "#db2777" },
    { code: "AT", number: 12, title: "Reading attitude", subtitle: "Tell Sunny how reading feels", sitting: 2, color: "#db2777" },
    { code: "WT", number: 13, title: "Writing", subtitle: "Show what you can write", sitting: 3, color: "#ca8a04" },
  ],
  2: [
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
  ],
};
// Levels without their own list yet use Level 2's.
function partsFor(level: number | undefined): Part[] { return LEVEL_PARTS[level ?? 2] ?? LEVEL_PARTS[2]; }

/**
 * The game is split into missions: one per ReadWell part when the items
 * carry part codes (the Level 2 quest), otherwise every MISSION_SIZE
 * questions. Stars reward effort, one per question answered, never
 * correctness: the child mustn't be able to tell right from wrong, or the
 * assessment stops measuring what they know.
 */
const MISSION_SIZE = 5;
const MISSION_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#ea580c", "#db2777", "#ca8a04"];
const PRAISE = ["Nice work!", "Super!", "You did it!", "Awesome!", "Way to go!", "High five!", "You're a star!", "Brilliant!"];

/** What the server said about a child's first answer to a choice item. */
interface Verdict { answer: string; correct: boolean; feedback: boolean }
/** The retry: practice only, never scored (see the kiosk route). */
interface Tries {
  id: string;
  /** Options already tried on the retry, and whether each was right. */
  results: Record<string, boolean>;
  /** The right option, once found. */
  solved: string | null;
  /** The right option, shown after a second miss. */
  revealed: string | null;
  checking: boolean;
  /** The check failed (no connection), so the item goes neutral. */
  gaveUp: boolean;
}

const RIGHT_WORDS = ["That's right!", "You got it!", "Yes! Super!", "Brilliant!", "Well done!"];

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
function partFor(parts: Part[], item?: KioskItem) { return parts.find((part) => item?.id.toUpperCase().startsWith(part.code)); }
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.86;
  window.speechSynthesis.speak(utterance);
}
/**
 * What Sunny reads out: the item's `say` if it has one, otherwise the
 * passage and prompt. A read-aloud item never reads its passage, which is
 * what the child is meant to read themselves.
 */
function itemSpokenText(item: KioskItem) {
  if (item.say) return item.say;
  return item.type === "mic" ? item.prompt : [item.passage, item.prompt].filter(Boolean).join(". ");
}
function isAnswered(answer: unknown) { return typeof answer === "string" ? answer.trim().length > 0 : answer !== undefined && answer !== null; }
// What a read-aloud item records when the child skips it; scored as wrong (evaluateResponse in src/lib/kiosk.ts).
const SKIPPED = "skipped";
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
    const key = byPart ? part.code : String(Math.floor(index / MISSION_SIZE));
    const last = missions[missions.length - 1];
    if (last && last.key === key) { last.end = index + 1; return; }
    const n = missions.length;
    missions.push(byPart
      ? { key, title: part.title, subtitle: part.subtitle, color: part.color, sitting: part.sitting, partLabel: `PART ${part.number} · ${part.code}`, start: index, end: index + 1 }
      : { key, title: `Mission ${n + 1}`, subtitle: "", color: MISSION_COLORS[n % MISSION_COLORS.length], sitting: null, partLabel: null, start: index, end: index + 1 });
  });
  for (const m of missions) if (!m.partLabel) m.subtitle = `${m.end - m.start} question${m.end - m.start === 1 ? "" : "s"}`;
  return missions;
}

/** The path of missions across a little sky, with Sunny's face at the current one. */
function QuestMap({ missions, current, children }: { missions: Mission[]; current: number; children?: ReactNode }) {
  const stops = missions.length + 1; // the trophy at the end
  const at = (i: number) => ((Math.min(i, stops - 1) + 0.5) / stops) * 100;
  return (
    <div className="rw-map">
      <span className="rw-cloud" aria-hidden="true" /><span className="rw-cloud c2" aria-hidden="true" /><span className="rw-cloud c3" aria-hidden="true" />
      <div className="rw-path" role="img" aria-label={current >= missions.length ? "Every mission done" : `Quest map: mission ${current + 1} of ${missions.length}`} style={{ gridTemplateColumns: `repeat(${stops}, 1fr)` }}>
        <div className="rw-path-line" style={{ left: `${at(0)}%`, right: `${100 - at(stops - 1)}%` }} />
        <div className="rw-path-fill" style={{ left: `${at(0)}%`, width: `${at(current) - at(0)}%` }} />
        {missions.map((m, i) => (
          <span key={m.key + i} className={`rw-node ${i < current ? "done" : i === current ? "current" : ""}`} style={{ "--node-color": m.color } as CSSProperties}>
            {i < current ? "★" : ""}
          </span>
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
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [tries, setTries] = useState<Tries | null>(null);
  /** The item whose first answer is on its way to the server, so a second tap waits for the verdict. */
  const [awaitingId, setAwaitingId] = useState<string | null>(null);
  /** The wrong answer that has already had its "oops" moment, so Sunny moves on to encouraging. */
  const [encouraged, setEncouraged] = useState<string | null>(null);
  const pendingRef = useRef<Record<string, unknown>>({});
  const storyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const starsRef = useRef<HTMLSpanElement>(null);
  const finishCelebrated = useRef(false);
  /** The item whose star sound is waiting on the server's verdict (see settleStar). */
  const starPendingRef = useRef<string | null>(null);

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
    if (started && item && speechSupported) speak(itemSpokenText(item));
    return () => window.speechSynthesis?.cancel();
  }, [item, started, speechSupported]);

  // The big finish, once per visit to the finished screen.
  useEffect(() => {
    if (state?.status !== "completed" || finishCelebrated.current) return;
    finishCelebrated.current = true;
    playSound("quest");
    burst("quest");
  }, [state?.status]);

  // Right or wrong, for the choice item in front of the child (feedbackOn is
  // false offline, for items with no wrong answer, and for everything else).
  const itemId = item?.id;
  const firstVerdict = itemId ? verdicts[itemId] : undefined;
  const feedbackOn = !!firstVerdict && firstVerdict.feedback && firstVerdict.answer === savedString;
  const mine = tries && itemId && tries.id === itemId ? tries : null;
  type Phase = "none" | "right" | "wrong" | "checking" | "solved" | "revealed" | "gaveup";
  let phase: Phase = "none";
  if (feedbackOn && firstVerdict) {
    if (firstVerdict.correct) phase = "right";
    else if (mine?.solved) phase = "solved";
    else if (mine?.revealed) phase = "revealed";
    else if (mine?.gaveUp || (mine && !mine.checking)) phase = "gaveup";
    else if (mine?.checking) phase = "checking";
    else phase = "wrong";
  }
  const feedbackKey = feedbackOn && phase !== "checking" ? `${itemId}:${phase}` : null;

  // Sound, speech and the star shower, once per change in how the item is going.
  useEffect(() => {
    if (!feedbackKey) return;
    const kind = feedbackKey.slice(feedbackKey.lastIndexOf(":") + 1);
    if (kind === "right") {
      playSound("star");
      burst("star", originOf(starsRef.current));
      if (speechSupported) speak("That's right!");
    } else if (kind === "solved") {
      playSound("star");
      burst("star");
      if (speechSupported) speak("You got it!");
    } else if (kind === "wrong") {
      playSound("oops");
      if (speechSupported) speak("Not quite. Try again!");
      // Sunny's sheepish "oops" first, then the encouraging pose.
      const timer = setTimeout(() => setEncouraged(feedbackKey), 1400);
      return () => clearTimeout(timer);
    } else if (kind === "revealed") {
      playSound("oops");
      if (speechSupported) speak("That's okay. It's this one!");
    }
  }, [feedbackKey, speechSupported]);

  const flushPending = useCallback(async () => {
    const entries = Object.entries(pendingRef.current);
    if (!entries.length) return true;
    setSyncing(true);
    let ok = true;
    for (const [itemId, answer] of entries) {
      let gaveVerdict = false;
      try {
        const response = await fetch(`/api/kiosk/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, answer }) });
        if (response.ok) {
          delete pendingRef.current[itemId];
          // The server says whether a choice answer was right; the screen shows it only for the item in front of the child.
          const body = await response.json().catch(() => null) as { isCorrect?: unknown; feedback?: unknown } | null;
          if (body && typeof body.isCorrect === "boolean" && typeof answer === "string") {
            gaveVerdict = body.feedback === true;
            setVerdicts((current) => ({ ...current, [itemId]: { answer, correct: body.isCorrect as boolean, feedback: body.feedback === true } }));
          }
        } else ok = false;
      } catch { ok = false; }
      setAwaitingId((current) => (current === itemId ? null : current));
      // The star's sound and shower were held back for a verdict. When one
      // came, its own sound plays; when none did (feedback switched off, a
      // reading-attitude question, no connection), the star plays now.
      if (starPendingRef.current === itemId) {
        starPendingRef.current = null;
        if (!gaveVerdict) {
          playSound("star");
          burst("star", originOf(starsRef.current));
        }
      }
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
    // A choice answer's sound waits for the verdict (a star for a right
    // answer, a soft "oops" otherwise) unless there's no connection to get one.
    const waitsForVerdict = item.type === "choice" && isOnline;
    if (firstAnswer) {
      if (waitsForVerdict) starPendingRef.current = item.id;
      else {
        playSound("star");
        burst("star", originOf(starsRef.current));
      }
      setStarBump((n) => n + 1);
    } else if (item.type === "choice" || answer === SKIPPED) {
      playSound("tap");
    }
  }

  /** A tap on a choice: the first answer is scored; after a wrong one, one practice retry. */
  async function chooseOption(option: string) {
    if (!item || item.type !== "choice" || !state) return;
    const id = item.id;
    if (awaitingId === id) return;
    const first = verdicts[id];
    const marked = first && first.feedback && first.answer === (typeof state.answersByItemId[id] === "string" ? state.answersByItemId[id] : "");
    if (!marked) {
      // The first answer (or, with no feedback, a change of mind).
      if (isOnline) {
        setAwaitingId(id);
        setTimeout(() => setAwaitingId((current) => (current === id ? null : current)), 8000);
      }
      saveAnswer(option);
      return;
    }
    const mine = tries?.id === id ? tries : null;
    if (first.correct || mine?.solved || mine?.revealed || mine?.checking || mine?.gaveUp) return;
    if (option === first.answer || (mine && option in mine.results)) return;
    setTries({ id, results: mine?.results ?? {}, solved: null, revealed: null, checking: true, gaveUp: false });
    try {
      const response = await fetch(`/api/kiosk/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: id, answer: option }) });
      const body = await response.json() as { isCorrect?: unknown; correctOption?: unknown };
      if (!response.ok || typeof body.isCorrect !== "boolean") throw new Error("check failed");
      const correct = body.isCorrect;
      setTries((current) => ({
        id,
        results: { ...(current?.id === id ? current.results : {}), [option]: correct },
        solved: correct ? option : null,
        revealed: !correct && typeof body.correctOption === "string" ? body.correctOption : null,
        checking: false,
        gaveUp: false,
      }));
    } catch {
      setTries((current) => (current?.id === id ? { ...current, checking: false, gaveUp: true } : current));
    }
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
    if (qIndex < state.items.length - 1) {
      if (missionIndexOf(qIndex + 1) !== missionIndex) {
        setCelebrating(missionIndex);
        playSound("mission");
        burst("mission");
        if (speechSupported) speak("Mission complete! Great job!");
        return;
      }
      setQIndex((index) => index + 1);
      return;
    }
    setCompleting(true);
    const ok = await complete();
    setCompleting(false);
    if (!ok) localStorage.setItem(pendingCompleteKey, "1");
  }

  function continueQuest() {
    setCelebrating(null);
    setQIndex((index) => index + 1);
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
        <button className="rw-primary rw-start" onClick={() => { setStarted(true); playSound("tap"); if (item && speechSupported) speak(itemSpokenText(item)); }}>Let&apos;s start <span>→</span></button>
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
    const breakTime = !!upNext && done.sitting !== null && upNext.sitting !== null && upNext.sitting !== done.sitting;
    return (
      <div className="rw-assessment-shell">
        <QuestMap missions={missions} current={celebrating + 1} />
        <div className="rw-celebrate-card">
          <AnimatedSunny mood="cheer" size={160} say="Mission complete!" className="rw-celebrate-sunny" />
          <div className="rw-eyebrow">MISSION {celebrating + 1} OF {missions.length}</div>
          <h1>{done.title}: done!</h1>
          <div className="rw-earned" aria-label={`${earned} stars`}>
            {Array.from({ length: Math.min(earned, 10) }, (_, i) => <span key={i} style={{ animationDelay: `${150 + i * 90}ms` }}>⭐</span>)}
          </div>
          {breakTime && <div className="rw-break-note">Time for a little break! Your teacher will tell you when to start the next part.</div>}
          {upNext && <p>Next up: <strong>{upNext.title}</strong>{upNext.partLabel ? ` · ${upNext.subtitle}` : ""}</p>}
          <button className="rw-primary rw-start" onClick={continueQuest} autoFocus>Next mission <span>→</span></button>
        </div>
      </div>
    );
  }

  const canProceed = item.type === "choice" ? !!savedString : item.type === "text" ? savedString.trim().length > 0 : !!savedString;
  // Pictures (and single letters or marks) show as big tiles a child can tap; anything wordier stays a list.
  const pictures = (item.options ?? []).map(optionPicture);
  const tiles = pictures.length > 0 && pictures.every((p) => (p.src ? !p.label : p.label.length <= 3));
  /** How each option looks: still open, picked, or (when the game gives feedback) right, wrong, revealed or out of play. */
  function optionState(option: string): "" | "selected" | "wrong" | "correct" | "reveal" | "dim" {
    if (!feedbackOn || !firstVerdict) return savedString === option ? "selected" : "";
    const tried = option === savedString || (!!mine && option in mine.results);
    if (phase === "right") return option === savedString ? "correct" : "dim";
    if (phase === "solved") return option === mine?.solved ? "correct" : tried ? "wrong" : "dim";
    if (phase === "revealed") return option === mine?.revealed ? "reveal" : tried ? "wrong" : "dim";
    if (phase === "gaveup") return tried ? "wrong" : "dim";
    return tried ? "wrong" : "";
  }
  // A single word to read aloud shows big, like a flash card.
  const wordCard = item.type === "mic" && !!item.passage && item.passage.length <= 14;
  const firstInMission = qIndex === mission.start;
  const leftInMission = mission.end - (qIndex + 1);
  const lastQuestion = qIndex === state.items.length - 1;
  const sittingLabel = mission.sitting === 1 ? "First sitting" : mission.sitting === 2 ? "Second sitting" : "Writing time";

  let mood: SunnyMood;
  let say: string;
  if (recording) { mood = "listen"; say = "I'm listening…"; }
  else if (savedString === SKIPPED) { mood = "thumbs"; say = "That's okay! On to the next one."; }
  else if (phase === "right") { mood = qIndex % 2 ? "cheer" : "thumbs"; say = RIGHT_WORDS[qIndex % RIGHT_WORDS.length]; }
  else if (phase === "solved") { mood = "cheer"; say = "You got it!"; }
  else if (phase === "wrong") { mood = encouraged === feedbackKey ? "try" : "oops"; say = encouraged === feedbackKey ? "You can do it. Try again!" : "Oops! Not quite."; }
  else if (phase === "checking") { mood = "think"; say = "Let's see…"; }
  else if (phase === "revealed") { mood = "point"; say = "It's this one! On to the next."; }
  else if (phase === "gaveup") { mood = "thumbs"; say = "That's okay! On to the next one."; }
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
      <span>Mission {missionIndex + 1} of {missions.length}</span>
      {syncing && <span className="rw-saving">Saving…</span>}
    </QuestMap>
    <div className="rw-stage">
      <AnimatedSunny mood={mood} size={120} say={say} peek className="rw-stage-sunny" />
      <main className="rw-mission-card">
        <div className="rw-mission-top"><div className="rw-part-badge" style={{ background: mission.color }}>{mission.partLabel ?? `MISSION ${missionIndex + 1}`}</div>{speechSupported && <button className="rw-listen" onClick={() => speak(itemSpokenText(item))}><SpeakerIcon size={17} color="currentColor" /> Listen</button>}</div>
        {firstInMission && <div className="rw-part-intro"><strong>{mission.title}</strong><span>{mission.subtitle}</span></div>}
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
              const state = optionState(option);
              const note = state === "wrong" ? "not quite" : state === "correct" || state === "reveal" ? "the right answer" : "";
              return (
                <button key={option} className={`rw-option ${tiles ? "rw-tile" : ""} ${state}`} onClick={() => chooseOption(option)} aria-label={tiles && picture.src ? `Choice ${i + 1}${note ? `, ${note}` : ""}` : undefined} aria-pressed={state === "selected"}>
                  {!tiles && <span className="rw-option-letter">{state === "wrong" ? "✕" : String.fromCharCode(65 + i)}</span>}
                  <OptionImage picture={picture} tile={tiles} />
                  {tiles ? !picture.src && <span className="rw-tile-glyph">{picture.label}</span> : <span>{picture.label}</span>}
                  {!tiles && note && <span className="sr-only">, {note}</span>}
                  {(state === "selected" || state === "correct" || state === "reveal") && <span className="rw-check">✓</span>}
                  {state === "wrong" && tiles && <span className="rw-check">✕</span>}
                </button>
              );
            })}
          </div>
        )}
        {item.type === "text" && <textarea className="rw-writing-input" value={savedString} onChange={(event) => saveAnswer(event.target.value)} placeholder="Write your answer here…" rows={3} autoFocus />}
        {item.type === "mic" && <div className="rw-mic-wrap"><button className={`rw-mic ${savedString ? "done" : recording ? "recording" : ""}`} onClick={recordMic} aria-label="Read aloud"><MicIcon /></button><strong>{savedString === SKIPPED ? "Skipped" : savedString ? "Nice reading! ✓" : recording ? "Sunny is listening…" : "Tap to read aloud"}</strong><small>Take your time. You can try once.</small>{!savedString && !recording && <button className="rw-skip" onClick={() => saveAnswer(SKIPPED)}>I can&apos;t read this one yet</button>}</div>}
      </main>
    </div>
    <div className="rw-actions">
      <span className="rw-encouragement">{lastQuestion ? "Last one. You're almost there!" : leftInMission === 0 ? "Last one in this mission!" : `${leftInMission} more in this mission`}</span>
      {canProceed && <button className="rw-primary" onClick={next} disabled={completing}>{completing ? "Finishing…" : lastQuestion ? "Finish quest ✓" : leftInMission === 0 ? "Finish mission ★" : "Next →"}</button>}
    </div>
  </div>;
}
