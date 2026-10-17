"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateClassSummary } from "./students/[studentId]/report/summaryActions";

const button = "font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer border-none disabled:opacity-60";

type Failure = { name: string; message: string };

/**
 * "Draft summaries for the class" on the class list: writes an AI summary
 * for every finished assessment that hasn't one, one child at a time so the
 * teacher sees it move and can stop it. Each is only a draft, approved one
 * by one on the child's report; nothing is approved here.
 */
export function DraftClassSummaries({ sessions }: { sessions: { sessionId: string; name: string }[] }) {
  const router = useRouter();
  const [running, setRunning] = useState<{ at: number; of: number; name: string } | null>(null);
  const [result, setResult] = useState<{ drafted: number; failures: Failure[]; stopped: string | null } | null>(null);
  const stop = useRef(false);

  async function draftAll() {
    const queue = [...sessions];
    stop.current = false;
    setResult(null);
    let drafted = 0;
    const failures: Failure[] = [];
    let stopped: string | null = null;
    let previous: { index: number; message: string } | null = null;
    for (const [i, s] of queue.entries()) {
      if (stop.current) {
        stopped = "Stopped. The rest have no summary yet.";
        break;
      }
      setRunning({ at: i + 1, of: queue.length, name: s.name });
      let message: string | null = null;
      try {
        const r = await generateClassSummary(s.sessionId);
        if (r.ok) drafted += 1;
        else message = r.message;
      } catch {
        message = "That didn't go through. Reload the page and try again (the app may have just been updated).";
      }
      if (message) {
        failures.push({ name: s.name, message });
        // The same problem twice running (switched off, limit reached, no connection) would stop the rest too.
        if (previous?.index === i - 1 && previous.message === message) {
          stopped = message;
          break;
        }
        previous = { index: i, message };
      }
    }
    setRunning(null);
    setResult({ drafted, failures, stopped });
    router.refresh();
  }

  return (
    <section
      aria-labelledby="class-summaries-heading"
      className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-6 py-5 mb-5"
    >
      <h2 id="class-summaries-heading" className="font-heading font-bold text-sm text-[var(--color-ink)] m-0 mb-1">
        Summaries
      </h2>
      {running ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p role="status" aria-live="polite" className="text-sm text-[var(--color-body)] m-0">
            Writing {running.at} of {running.of}: {running.name}…
          </p>
          <button type="button" className={`${button} bg-[var(--color-neutral)] text-[var(--color-ink)]`} onClick={() => (stop.current = true)}>
            Stop
          </button>
        </div>
      ) : sessions.length > 0 ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-[var(--color-body)] m-0 max-w-[520px]">
            {sessions.length === 1 ? "1 finished assessment has" : `${sessions.length} finished assessments have`} no summary yet. Each one
            is a draft: read, change and approve it on the child&apos;s report.
          </p>
          <button type="button" className={`${button} bg-[var(--color-orange)] text-[var(--color-on-orange)]`} onClick={draftAll}>
            Draft {sessions.length === 1 ? "it" : `all ${sessions.length}`}
          </button>
        </div>
      ) : (
        !result && <p className="text-sm text-[var(--color-muted)] m-0">Every finished assessment has a summary.</p>
      )}
      {result && (
        <div role="status" className="text-sm text-[var(--color-body)] mt-3">
          <p className="m-0">
            {result.drafted === 1 ? "1 summary drafted" : `${result.drafted} summaries drafted`}
            {result.drafted > 0 ? ". Look for “Summary to check” below." : "."}
          </p>
          {result.stopped && <p className="font-bold text-[var(--color-orange-dark)] m-0 mt-1">{result.stopped}</p>}
          {result.failures.length > 0 && !result.stopped && (
            <ul className="m-0 mt-1 pl-5 text-[var(--color-orange-dark)]">
              {result.failures.map((f, i) => (
                <li key={i}>
                  {f.name}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
