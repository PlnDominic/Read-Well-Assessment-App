"use client";

import { useState, useTransition } from "react";
import type { SummaryContent } from "@/lib/aiSummary";
import { listToLines } from "@/lib/aiSummary";
import { approveSummary, discardSummary, generateSummary, saveSummary, type SummaryActionResult } from "./summaryActions";

export interface PanelSummary {
  status: "draft" | "approved";
  content: SummaryContent;
  edited: boolean;
}

const card = "bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5";
const button = "font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer border-none disabled:opacity-60";
const primary = `${button} bg-[var(--color-orange)] text-[var(--color-on-orange)]`;
const quiet = `${button} bg-[var(--color-neutral)] text-[var(--color-ink)]`;
const field = "w-full rounded-xl border border-[var(--color-neutral-border)] bg-[var(--color-surface)] text-[var(--color-ink)] text-sm p-3 font-[inherit]";

function Points({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-xs font-extrabold uppercase text-[var(--color-muted)] mb-1">{title}</div>
      <ul className="m-0 pl-5 text-sm text-[var(--color-body)] leading-relaxed">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

/**
 * The AI-drafted summary on a student's report: draft it, read and edit it,
 * approve it. Only an approved summary reaches the PDF. A reading specialist
 * (canEdit false) sees an approved summary and nothing else.
 */
export function SummaryPanel({
  sessionId,
  summary,
  canEdit,
  aiAvailable,
  unavailable,
}: {
  sessionId: string;
  summary: PanelSummary | null;
  canEdit: boolean;
  aiAvailable: boolean;
  /** Why drafting isn't offered, when it isn't. */
  unavailable: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function run(action: (data: FormData) => Promise<SummaryActionResult>, data: FormData, done?: () => void) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result.ok) done?.();
        else setMessage(result.message);
      } catch {
        // The request itself failed: no connection, or this page is from before the app was updated.
        setMessage("That didn't go through. Reload the page and try again (the app may have just been updated).");
      }
    });
  }
  const withSession = () => {
    const data = new FormData();
    data.set("sessionId", sessionId);
    return data;
  };

  if (!summary) {
    // Nothing to show a reading specialist, or anyone, until a teacher drafts one.
    if (!canEdit) return null;
    return (
      <section className={card} aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="font-heading font-bold text-sm text-[var(--color-ink)] m-0 mb-2">Summary</h2>
        <p className="text-sm text-[var(--color-body)] m-0 mb-3">
          Get a short, plain-language write-up of how {`this child`} did, with ideas for what to try next. It is a draft:
          you read it, change it and approve it before it appears on the PDF.
        </p>
        {aiAvailable ? (
          <button type="button" className={primary} disabled={pending} onClick={() => run(generateSummary, withSession())}>
            {pending ? "Writing…" : "Draft a summary"}
          </button>
        ) : (
          <p className="text-sm text-[var(--color-muted)] m-0">{unavailable}</p>
        )}
        {message && <p role="alert" className="text-sm font-bold text-[var(--color-orange-dark)] mt-3 mb-0">{message}</p>}
      </section>
    );
  }

  const { content } = summary;
  const approved = summary.status === "approved";

  return (
    <section className={card} aria-labelledby="summary-heading">
      <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
        <h2 id="summary-heading" className="font-heading font-bold text-sm text-[var(--color-ink)] m-0">Summary</h2>
        <span
          className="font-bold text-xs px-3 py-1.5 rounded-full"
          style={{
            background: approved ? "var(--color-ink)" : "var(--color-orange-tint)",
            color: approved ? "var(--color-surface)" : "var(--color-orange-dark)",
          }}
        >
          {approved ? "Approved · on the PDF" : "Draft · check it, then approve"}
        </span>
      </div>

      {editing && canEdit ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(saveSummary, new FormData(event.currentTarget), () => setEditing(false));
          }}
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">Overview
            <textarea name="overview" defaultValue={content.overview} rows={4} className={`${field} mt-1`} required />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">What they can do (one point per line)
            <textarea name="strengths" defaultValue={listToLines(content.strengths)} rows={3} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">Still learning (one point per line)
            <textarea name="toSupport" defaultValue={listToLines(content.toSupport)} rows={3} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">Next steps (one per line)
            <textarea name="nextSteps" defaultValue={listToLines(content.nextSteps)} rows={4} className={`${field} mt-1`} required />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">Note for the family
            <textarea name="familyNote" defaultValue={content.familyNote} rows={3} className={`${field} mt-1`} required />
          </label>
          <div className="flex gap-3 flex-wrap">
            <button type="submit" className={primary} disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
            <button type="button" className={quiet} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-sm text-[var(--color-body)] leading-relaxed m-0 mb-3">{content.overview}</p>
          <Points title="What they can do" items={content.strengths} />
          <Points title="Still learning" items={content.toSupport} />
          <Points title="Next steps" items={content.nextSteps} />
          <div className="mb-3">
            <div className="text-xs font-extrabold uppercase text-[var(--color-muted)] mb-1">Note for the family</div>
            <p className="text-sm text-[var(--color-body)] leading-relaxed m-0">{content.familyNote}</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] m-0 mb-4">
            Drafted by AI from this assessment&apos;s scores{summary.edited ? " and edited by a teacher" : ""}. AI can make mistakes:
            the scores and bands above are the record.
          </p>
          {canEdit && (
            <div className="flex gap-3 flex-wrap">
              {!approved && (
                <button type="button" className={primary} disabled={pending} onClick={() => run(approveSummary, withSession())}>
                  {pending ? "Saving…" : "Approve for the PDF"}
                </button>
              )}
              <button type="button" className={quiet} disabled={pending} onClick={() => setEditing(true)}>Edit</button>
              {aiAvailable && (
                <button
                  type="button"
                  className={quiet}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Write a new draft? This replaces the summary above, including any edits.")) run(generateSummary, withSession());
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
                  if (window.confirm("Remove this summary?")) run(discardSummary, withSession());
                }}
              >
                Remove
              </button>
            </div>
          )}
        </>
      )}
      {message && <p role="alert" className="text-sm font-bold text-[var(--color-orange-dark)] mt-3 mb-0">{message}</p>}
    </section>
  );
}
