"use client";

import { useState, useTransition } from "react";
import { listToLines, titledToLines } from "@/lib/aiSummary";
import type { CycleSummaryContent } from "@/lib/cycleSummary";
import { CycleSummaryView } from "@/components/CycleSummaryView";
import { approveCycleSummary, discardCycleSummary, generateCycleSummary, saveCycleSummary, type CycleSummaryResult } from "./summaryActions";

const button = "font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer border-none disabled:opacity-60";
const primary = `${button} bg-[var(--color-orange)] text-[var(--color-on-orange)]`;
const quiet = `${button} bg-[var(--color-neutral)] text-[var(--color-ink)]`;
const field = "w-full rounded-xl border border-[var(--color-neutral-border)] bg-[var(--color-surface)] text-[var(--color-ink)] text-sm p-3 font-[inherit]";
const labelStyle = "text-sm font-bold text-[var(--color-ink-soft)]";

/**
 * A cycle's AI-drafted summary on the admin Overview (0023), for the whole
 * school (teacherId null) or one class: draft it, read and edit it, approve
 * it. Only an approved school summary reaches the school PDF; an approved
 * class summary is also shown to that class's teacher.
 */
export function CycleSummaryPanel({
  cycleId,
  teacherId,
  scopeName,
  summary,
  aiAvailable,
  unavailable,
}: {
  cycleId: string;
  teacherId: string | null;
  /** "the whole school" or "Ms Rivera's class". */
  scopeName: string;
  summary: { status: "draft" | "approved"; content: CycleSummaryContent; edited: boolean } | null;
  aiAvailable: boolean;
  /** Why drafting isn't offered, when it isn't. */
  unavailable: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const scoped = () => {
    const data = new FormData();
    data.set("cycleId", cycleId);
    if (teacherId) data.set("teacherId", teacherId);
    return data;
  };
  const run = (action: (data: FormData) => Promise<CycleSummaryResult>, data: FormData, done?: () => void) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result.ok) done?.();
        else setMessage(result.message);
      } catch {
        setMessage("That didn't go through. Reload the page and try again (the app may have just been updated).");
      }
    });
  };

  const alert = message && <p role="alert" className="text-sm font-bold text-[var(--color-orange-dark)] mt-3 mb-0">{message}</p>;

  if (!summary) {
    return (
      <>
        <p className="text-sm text-[var(--color-body)] m-0 mb-3">
          A short write-up of how {scopeName} did this cycle, with what to work on first. It&apos;s made from the totals only, never a
          child&apos;s answers or name, and it&apos;s a draft until you approve it.
        </p>
        {aiAvailable ? (
          <button type="button" className={primary} disabled={pending} onClick={() => run(generateCycleSummary, scoped())}>
            {pending ? "Writing…" : "Draft a summary"}
          </button>
        ) : (
          <p className="text-sm text-[var(--color-muted)] m-0">{unavailable}</p>
        )}
        {alert}
      </>
    );
  }

  const { content } = summary;
  const approved = summary.status === "approved";
  const where = teacherId ? "shown to the class's teacher" : "on the school PDF";

  return (
    <>
      <div className="mb-3">
        <span
          className="font-bold text-xs px-3 py-1.5 rounded-full"
          style={{
            background: approved ? "var(--color-ink)" : "var(--color-orange-tint)",
            color: approved ? "var(--color-surface)" : "var(--color-orange-dark)",
          }}
        >
          {approved ? `Approved · ${where}` : "Draft · check it, then approve"}
        </span>
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(saveCycleSummary, new FormData(event.currentTarget), () => setEditing(false));
          }}
        >
          <input type="hidden" name="cycleId" value={cycleId} />
          {teacherId && <input type="hidden" name="teacherId" value={teacherId} />}
          <label className={labelStyle}>Headline
            <input name="headline" defaultValue={content.headline} className={`${field} mt-1`} required />
          </label>
          <label className={labelStyle}>Overview
            <textarea name="overview" defaultValue={content.overview} rows={3} className={`${field} mt-1`} required />
          </label>
          <label className={labelStyle}>Going well (one per line)
            <textarea name="strengths" defaultValue={listToLines(content.strengths)} rows={4} className={`${field} mt-1`} />
          </label>
          <label className={labelStyle}>Work on first (up to three lines, each as Title: what to do)
            <textarea name="priorities" defaultValue={titledToLines(content.priorities)} rows={4} className={`${field} mt-1`} required />
          </label>
          <label className={labelStyle}>Next steps (one per line)
            <textarea name="actions" defaultValue={listToLines(content.actions)} rows={4} className={`${field} mt-1`} required />
          </label>
          <div className="flex gap-3 flex-wrap">
            <button type="submit" className={primary} disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
            <button type="button" className={quiet} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <CycleSummaryView content={content} />
          <p className="text-xs text-[var(--color-muted)] m-0 mb-4">
            Drafted by AI from this cycle&apos;s totals{summary.edited ? " and edited by an administrator" : ""}. AI can make mistakes: the
            numbers above are the record.
          </p>
          <div className="flex gap-3 flex-wrap">
            {!approved && (
              <button type="button" className={primary} disabled={pending} onClick={() => run(approveCycleSummary, scoped())}>
                {pending ? "Saving…" : "Approve"}
              </button>
            )}
            <button type="button" className={quiet} disabled={pending} onClick={() => setEditing(true)}>Edit</button>
            {aiAvailable && (
              <button
                type="button"
                className={quiet}
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Write a new draft? This replaces the summary above, including any edits.")) run(generateCycleSummary, scoped());
                }}
              >
                Write a new draft
              </button>
            )}
            <button
              type="button"
              className={quiet}
              disabled={pending}
              onClick={() => {
                if (window.confirm("Remove this summary?")) run(discardCycleSummary, scoped());
              }}
            >
              Remove
            </button>
          </div>
        </>
      )}
      {alert}
    </>
  );
}
