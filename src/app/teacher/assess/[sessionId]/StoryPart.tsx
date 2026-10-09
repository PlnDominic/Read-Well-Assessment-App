"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AssessmentItem } from "@/lib/database.types";
import { isScoredItem, shortCode, storyWordCounts, type FormDef, type StoryRecord } from "@/lib/readwell/form";
import { isStoryRecord, type Answers, type PartFlow } from "@/lib/readwell/flow";
import { RightWrong } from "./ui";

const TIME_LIMIT_SECONDS = 120;

/**
 * Part 11. The child reads "Tim and the pup" from the stimulus book while
 * the assessor follows on screen: start the timer at the first word, tap
 * any word read wrongly or skipped (a slash on paper), and stop at the end
 * or at 2 minutes, marking the last word read (the bracket). Saving the
 * record gives words attempted, errors and time; the questions then appear
 * for the lines the child read. Gate E is applied from the saved record.
 */
export function StoryPart({
  form,
  items,
  flow,
  answers,
  setMarks,
}: {
  form: FormDef;
  items: AssessmentItem[];
  flow: PartFlow;
  answers: Answers;
  setMarks: (m: Answers) => void;
}) {
  const recordItem = items.find((i) => !isScoredItem(i))!;
  const questions = items.filter(isScoredItem);
  const saved = isStoryRecord(answers[recordItem.id]) ? (answers[recordItem.id] as StoryRecord) : null;

  const lines = form.story.lines;
  const words = useMemo(() => lines.flatMap((l) => l.split(" ")), [lines]);
  const lineStarts = useMemo(() => {
    const starts: number[] = [];
    let total = 0;
    for (const c of storyWordCounts(lines)) {
      starts.push(total);
      total += c;
    }
    return starts;
  }, [lines]);

  const [errorWords, setErrorWords] = useState<number[]>(saved?.errorWords ?? []);
  const [lastWord, setLastWord] = useState<number>(saved?.lastWord ?? words.length - 1);
  const [seconds, setSeconds] = useState<number>(saved?.seconds ?? 0);
  const [running, setRunning] = useState(false);
  const [bracketMode, setBracketMode] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000);
      if (elapsed >= TIME_LIMIT_SECONDS) {
        setSeconds(TIME_LIMIT_SECONDS);
        setRunning(false);
        setBracketMode(true);
      } else {
        setSeconds(elapsed);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [running]);

  const draft: StoryRecord = { errorWords: [...errorWords].sort((a, b) => a - b), lastWord, seconds };
  const unsaved = !saved || JSON.stringify(saved) !== JSON.stringify(draft);
  const firstLineAllWrong = lineStarts.length > 1 && Array.from({ length: lineStarts[1] }, (_, w) => w).every((w) => errorWords.includes(w));

  function tapWord(index: number) {
    if (bracketMode) {
      setLastWord(index);
      setBracketMode(false);
      return;
    }
    setErrorWords((prev) => (prev.includes(index) ? prev.filter((w) => w !== index) : [...prev, index]));
  }

  function start() {
    startedAt.current = Date.now() - seconds * 1000;
    setRunning(true);
    setBracketMode(false);
  }

  const attempted = lastWord + 1;
  const errors = errorWords.filter((w) => w <= lastWord).length;
  const asked = new Set(flow.activeItemIds);

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <span className="font-heading font-bold text-3xl tabular-nums text-[var(--color-ink)] min-w-[88px]" aria-live="polite">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
        {!running ? (
          <button
            type="button"
            onClick={start}
            className="bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-sm px-5 py-2.5 cursor-pointer"
          >
            {seconds === 0 ? "Start timer (first word)" : "Continue timer"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setRunning(false);
                setLastWord(words.length - 1);
              }}
              className="bg-[var(--color-ink)] text-[var(--color-surface)] border-none rounded-full font-bold text-sm px-5 py-2.5 cursor-pointer"
            >
              Child finished
            </button>
            <button
              type="button"
              onClick={() => {
                setRunning(false);
                setBracketMode(true);
              }}
              className="bg-[var(--color-neutral)] text-[var(--color-ink)] border-none rounded-full font-bold text-sm px-5 py-2.5 cursor-pointer"
            >
              Child stopped
            </button>
          </>
        )}
        <label className="text-xs text-[var(--color-muted)] flex items-center gap-1.5">
          Seconds
          <input
            type="number"
            min={0}
            max={TIME_LIMIT_SECONDS}
            value={seconds}
            disabled={running}
            onChange={(e) => setSeconds(Math.max(0, Math.min(TIME_LIMIT_SECONDS, Math.round(Number(e.target.value) || 0))))}
            className="w-16 border-2 border-[var(--color-neutral-border)] rounded-lg px-2 py-1 text-sm"
          />
        </label>
      </div>

      <p className="text-sm text-[var(--color-body)] m-0 mb-2">
        {bracketMode ? (
          <strong className="text-[var(--color-orange-dark)]">Tap the last word the child read (the bracket).</strong>
        ) : (
          "Tap a word read wrongly or skipped. Tap it again to undo."
        )}
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {lines.map((line, li) => (
          <div key={li} className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-extrabold text-[var(--color-muted)] w-5">{li + 1}</span>
            {line.split(" ").map((word, wi) => {
              const index = lineStarts[li] + wi;
              const wrong = errorWords.includes(index);
              const beyond = index > lastWord;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => tapWord(index)}
                  className="font-heading font-bold text-xl rounded-lg px-2 py-1 cursor-pointer"
                  style={{
                    border: `2px solid ${bracketMode ? "var(--color-orange)" : wrong ? "var(--color-orange)" : "transparent"}`,
                    background: wrong ? "var(--color-orange-tint)" : "transparent",
                    color: beyond ? "var(--color-muted-light)" : "var(--color-ink)",
                    textDecorationLine: wrong ? "line-through" : "none",
                    textDecorationColor: "var(--color-orange-dark)",
                    textDecorationThickness: 3,
                  }}
                >
                  {word}
                  {index === lastWord && index < words.length - 1 && <span className="text-[var(--color-orange-dark)]">]</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {firstLineAllWrong && (
        <p role="status" className="bg-[var(--color-orange-tint)] text-[var(--color-ink-soft)] text-sm rounded-xl px-4 py-3 m-0 mb-3">
          <strong>Gate E:</strong> no word in the first line is read correctly. Stop the child, then save the record. Do not ask the questions.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap mb-2">
        <button
          type="button"
          disabled={running || !unsaved}
          onClick={() => setMarks({ [recordItem.id]: draft })}
          className="bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-sm px-5 py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {saved ? (unsaved ? "Save changes to the record" : "Record saved") : "Save reading record"}
        </button>
        <span className="text-sm text-[var(--color-body)]">
          Words attempted {attempted} · errors {errors} · words correct {attempted - errors}
          {seconds > 0 && ` · ${Math.round(((attempted - errors) * 60) / seconds)} words correct per minute`}
        </span>
      </div>

      {saved && !flow.stopped && (
        <div className="mt-5">
          <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-2">
            Then ask the questions. Leave the story open in front of the child.
          </div>
          <div className="flex flex-col gap-3">
            {questions.map((q) =>
              asked.has(q.id) ? (
                <div key={q.id} className="flex justify-between items-center gap-3 flex-wrap border-b border-[var(--color-neutral-divider)] pb-3">
                  <div className="min-w-[220px] flex-1">
                    <div className="text-[11px] font-extrabold text-[var(--color-muted)] mb-0.5">
                      {shortCode(q.id)} · from line {q.fromLine}
                    </div>
                    <div className="font-bold text-[var(--color-ink)]">&ldquo;{q.prompt}&rdquo;</div>
                    <div className="text-xs text-[var(--color-body)] mt-0.5">Accept: {q.accept}</div>
                  </div>
                  <RightWrong itemId={q.id} answers={answers} setMarks={setMarks} />
                </div>
              ) : (
                <div key={q.id} className="text-sm text-[var(--color-muted)]">
                  {shortCode(q.id)}: not asked. The child didn&apos;t read to the end of line {q.fromLine}.
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
