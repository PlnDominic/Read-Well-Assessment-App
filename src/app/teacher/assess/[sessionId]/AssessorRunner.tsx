"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { AssessmentItem } from "@/lib/database.types";
import { formForItems } from "@/lib/readwell/forms";
import { computeFlow, isOneToOneComplete, nextPart, ONE_TO_ONE_PARTS, previousPart, type Answers, type PartFlow } from "@/lib/readwell/flow";
import { scoreForm } from "@/lib/readwell/score";
import { PartView } from "./PartView";
import { Card } from "./ui";

type Screen = "intro" | number | "finish" | "done";

// --- Offline queue ----------------------------------------------------------
// "A session that has started carries on if the connection drops." Marks
// are kept on this device until the server has them, so a dropped
// connection or a reload loses nothing. null in the queue means "clear
// this mark".

const pendingKey = (id: string) => `rw:assess:pending:${id}`;
const screenKey = (id: string) => `rw:assess:screen:${id}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort: private browsing or a full quota just means no offline copy
  }
}
function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

function applyPending(answers: Answers, pending: Answers): Answers {
  const next = { ...answers };
  for (const [id, value] of Object.entries(pending)) {
    if (value === null) delete next[id];
    else next[id] = value;
  }
  return next;
}

function firstOpenPart(flows: PartFlow[]): number | "finish" {
  for (const n of ONE_TO_ONE_PARTS) {
    const f = flows.find((x) => x.number === n)!;
    if (f.status !== "complete" && f.status !== "skipped") return n;
  }
  return "finish";
}

export function AssessorRunner({
  sessionId,
  studentId,
  studentName,
  gradeText,
  items,
  initialAnswers,
}: {
  sessionId: string;
  studentId: string;
  studentName: string;
  gradeText: string;
  items: AssessmentItem[];
  initialAnswers: Answers;
}) {
  const form = useMemo(() => formForItems(items)!, [items]);
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [screen, setScreen] = useState<Screen>(() =>
    Object.keys(initialAnswers).length === 0 ? "intro" : firstOpenPart(computeFlow(form, initialAnswers))
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [online, setOnline] = useState(true);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const pendingRef = useRef<Answers>({});

  const flows = useMemo(() => computeFlow(form, answers), [form, answers]);

  // Restore this device's unsent marks and place on mount (browser-only state).
  useEffect(() => {
    pendingRef.current = readJson<Answers>(pendingKey(sessionId), {});
    const count = Object.keys(pendingRef.current).length;
    const savedScreen = readJson<Screen | null>(screenKey(sessionId), null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    if (count > 0) {
      setPendingCount(count);
      setAnswers((prev) => applyPending(prev, pendingRef.current));
    }
    if (typeof savedScreen === "number" || savedScreen === "finish") setScreen(savedScreen);
  }, [sessionId]);

  useEffect(() => {
    if (screen !== "done") writeJson(screenKey(sessionId), screen);
  }, [screen, sessionId]);

  const flush = useCallback(async (): Promise<boolean> => {
    const batch = { ...pendingRef.current };
    if (Object.keys(batch).length === 0) return true;
    setSyncing(true);
    try {
      const res = await fetch(`/api/assess/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marks: batch }),
      });
      if (!res.ok) {
        setSaveFailed(true);
        return false;
      }
      setSaveFailed(false);
      // Drop only what was sent and hasn't changed since; a tap made while
      // this request was in flight stays queued for the next flush.
      for (const [id, value] of Object.entries(batch)) {
        if (JSON.stringify(pendingRef.current[id]) === JSON.stringify(value)) delete pendingRef.current[id];
      }
      writeJson(pendingKey(sessionId), pendingRef.current);
      setPendingCount(Object.keys(pendingRef.current).length);
      return Object.keys(pendingRef.current).length === 0;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setSyncing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(() => {
      if (Object.keys(pendingRef.current).length > 0) flush();
    }, 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [flush]);

  const setMarks = useCallback(
    (marks: Answers) => {
      Object.assign(pendingRef.current, marks);
      writeJson(pendingKey(sessionId), pendingRef.current);
      setPendingCount(Object.keys(pendingRef.current).length);
      setAnswers((prev) => applyPending(prev, marks));
      flush();
    },
    [sessionId, flush]
  );

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    const flushed = await flush();
    if (!flushed) {
      setFinishing(false);
      setFinishError("Some marks haven't reached the server yet. Check the connection and try again.");
      return;
    }
    try {
      const res = await fetch(`/api/assess/sessions/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFinishError(body.error ?? "Couldn't finish the assessment. Try again.");
        return;
      }
      removeKey(pendingKey(sessionId));
      removeKey(screenKey(sessionId));
      setScreen("done");
    } catch {
      setFinishError("This device is offline. Reconnect, then finish.");
    } finally {
      setFinishing(false);
    }
  }

  const reachable = (n: number) => {
    const open = firstOpenPart(flows);
    return open === "finish" || n <= open;
  };

  const waiting = `${pendingCount} mark${pendingCount === 1 ? "" : "s"}`;
  const syncText = !online
    ? `Offline: ${waiting} kept on this device`
    : saveFailed && pendingCount > 0
      ? `Not saved yet: ${waiting} kept on this device, retrying`
      : syncing || pendingCount > 0
        ? "Saving…"
        : "All marks saved";

  return (
    <div className="w-full max-w-[880px]">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
        <div>
          <Link href="/teacher" className="text-[var(--color-orange)] font-bold text-sm no-underline">
            &larr; Pause and return to class
          </Link>
          <h1 className="font-heading font-bold text-[26px] tracking-tight text-[var(--color-ink)] m-0 mt-2">{studentName}</h1>
          <p className="text-[var(--color-muted)] text-sm m-0">
            {gradeText} · {form.title}
          </p>
        </div>
        <span
          role="status"
          className="text-xs font-bold px-3 py-1.5 rounded-full"
          style={{
            background: online && !saveFailed ? "var(--color-neutral)" : "var(--color-orange-tint)",
            color: online && !saveFailed ? "var(--color-muted)" : "var(--color-orange-dark)",
          }}
        >
          {syncText}
        </span>
      </div>

      {screen !== "done" && (
        <nav aria-label="Parts" className="flex flex-wrap gap-1.5 mb-5">
          {ONE_TO_ONE_PARTS.map((n) => {
            const f = flows.find((x) => x.number === n)!;
            const part = form.parts.find((p) => p.number === n)!;
            const current = screen === n;
            const canGo = f.status !== "skipped" && reachable(n);
            return (
              <button
                key={n}
                type="button"
                disabled={!canGo}
                onClick={() => setScreen(n)}
                aria-current={current ? "step" : undefined}
                title={`Part ${n}: ${part.title}${f.status === "skipped" ? ` (skipped by ${f.skipped?.by})` : ""}`}
                className="text-xs font-bold px-2.5 py-1.5 rounded-full border-none cursor-pointer disabled:cursor-default"
                style={{
                  background: current
                    ? "var(--color-orange)"
                    : f.status === "complete"
                      ? "var(--color-ink)"
                      : "var(--color-neutral)",
                  color: current || f.status === "complete" ? "var(--color-surface)" : "var(--color-muted)",
                  textDecoration: f.status === "skipped" ? "line-through" : "none",
                  opacity: canGo || current ? 1 : 0.55,
                }}
              >
                {n} {part.code}
              </button>
            );
          })}
        </nav>
      )}

      {screen === "intro" && <Intro form={form} onStart={() => setScreen(firstOpenPart(flows))} resuming={Object.keys(answers).length > 0} />}

      {typeof screen === "number" && (
        <PartView
          key={screen}
          form={form}
          part={form.parts.find((p) => p.number === screen)!}
          flow={flows.find((f) => f.number === screen)!}
          flows={flows}
          answers={answers}
          setMarks={setMarks}
          onBack={() => setScreen(previousPart(flows, screen) ?? "intro")}
          onNext={() => setScreen(nextPart(flows, screen) ?? "finish")}
          nextLabel={nextLabel(flows, screen)}
        />
      )}

      {screen === "finish" && (
        <Card>
          <h2 className="font-heading font-bold text-xl text-[var(--color-ink)] m-0 mb-2">Finish the assessment</h2>
          {isOneToOneComplete(flows) ? (
            <>
              <p className="text-sm text-[var(--color-body)] m-0 mb-3">
                Every one-to-one part is marked. Finishing scores the assessment and prepares {studentName}&apos;s report.
                Part 13 (writing) is given to a small group on paper; score the writing sheet later from the report page.
              </p>
              <RulesApplied answers={answers} form={form} />
              {finishError && <p className="text-[var(--color-orange-dark)] text-sm font-bold m-0 mb-3">{finishError}</p>}
              <div className="flex gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setScreen(previousPart(flows, 13) ?? 12)}
                  className="font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer bg-[var(--color-neutral)] border-none text-[var(--color-ink)]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={finish}
                  disabled={finishing}
                  className="bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-sm px-5 py-2.5 cursor-pointer disabled:opacity-60"
                >
                  {finishing ? "Finishing…" : "Finish and score"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--color-body)] m-0">
              Some parts still need marks. Go back to Part {firstOpenPart(flows)} to finish them.
            </p>
          )}
        </Card>
      )}

      {screen === "done" && (
        <Card>
          <h2 className="font-heading font-bold text-xl text-[var(--color-ink)] m-0 mb-2">Assessment finished</h2>
          <p className="text-sm text-[var(--color-body)] m-0 mb-4">
            {studentName}&apos;s scores are saved and the report is being prepared. Score the Part 13 writing sheet from
            the report page once the group writing task is done.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link
              href={`/teacher/students/${studentId}/report?session=${sessionId}`}
              className="bg-[var(--color-orange)] text-white rounded-full font-bold text-sm px-5 py-2.5 no-underline"
            >
              View report
            </Link>
            <Link
              href="/teacher"
              className="bg-[var(--color-neutral)] text-[var(--color-ink)] rounded-full font-bold text-sm px-5 py-2.5 no-underline"
            >
              Back to class
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function nextLabel(flows: PartFlow[], part: number): string {
  const next = nextPart(flows, part);
  if (next === null) return "Next: finish";
  const skipped = flows.filter((f) => f.number > part && f.number < next && f.status === "skipped");
  return skipped.length > 0 ? `Next: Part ${next} (${skipped[0].skipped!.by} skips ${skipped.map((s) => s.number).join(", ")})` : `Next: Part ${next}`;
}

function RulesApplied({ answers, form }: { answers: Answers; form: NonNullable<ReturnType<typeof formForItems>> }) {
  const rules = scoreForm(form, answers).rulesApplied;
  if (rules.length === 0) return null;
  return (
    <div className="bg-[var(--color-neutral)] rounded-xl px-4 py-3 mb-4 text-sm">
      <div className="font-bold text-[var(--color-ink)] mb-1">Rules applied</div>
      <ul className="m-0 pl-5 list-disc">
        {rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function Intro({
  form,
  onStart,
  resuming,
}: {
  form: NonNullable<ReturnType<typeof formForItems>>;
  onStart: () => void;
  resuming: boolean;
}) {
  const { intro } = form;
  return (
    <Card>
      <h2 className="font-heading font-bold text-xl text-[var(--color-ink)] m-0 mb-1">Running a session</h2>
      <p className="text-sm text-[var(--color-muted)] m-0 mb-4">
        Parts 1 to 12 are given one to one in the order shown. Part 13 is given to a small group on paper. The app
        applies the stop and gate rules for you.
      </p>

      <Section title="The kit">
        <ul className="m-0 pl-5 list-disc">
          {intro.kit.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      </Section>

      <Section title="Before you begin">
        <ul className="m-0 pl-5 list-disc">
          {intro.beforeYouBegin.map((k) => (
            <li key={k}>{k}</li>
          ))}
          <li>
            Start with a friendly chat: <strong>&ldquo;{intro.opening}&rdquo;</strong> If the child says no or becomes
            upset, stop and try another day.
          </li>
        </ul>
      </Section>

      <Section title="Rules for every part">
        <ol className="m-0 pl-5 list-decimal">
          {intro.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </Section>

      <Section title="Gate rules">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[var(--color-muted)]">
                <th className="py-1.5 pr-3">Gate</th>
                <th className="py-1.5 pr-3">Check</th>
                <th className="py-1.5">If true</th>
              </tr>
            </thead>
            <tbody>
              {intro.gates.map((g) => (
                <tr key={g.gate} className="border-t border-[var(--color-neutral-divider)] align-top">
                  <td className="py-1.5 pr-3 font-bold">{g.gate}</td>
                  <td className="py-1.5 pr-3">{g.check}</td>
                  <td className="py-1.5">{g.ifTrue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-2 text-[var(--color-muted)]">{intro.tiredNote}</p>
      </Section>

      <button
        type="button"
        onClick={onStart}
        className="bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-base px-6 py-3 cursor-pointer mt-2"
      >
        {resuming ? "Resume" : "Start Part 1"}
      </button>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 text-sm text-[var(--color-body)]">
      <div className="font-heading font-bold text-[var(--color-ink)] mb-1.5">{title}</div>
      {children}
    </div>
  );
}
