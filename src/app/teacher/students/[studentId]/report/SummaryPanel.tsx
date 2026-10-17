"use client";

import { useState, useTransition } from "react";
import type { SummaryContent } from "@/lib/aiSummary";
import { listToLines, titledToLines } from "@/lib/aiSummary";
import { FAMILY_LANGUAGES, type FamilyLanguage, type FamilyNote } from "@/lib/familyNote";
import {
  approveSummary,
  discardSummary,
  generateFamilyNote,
  generateSummary,
  removeFamilyNote,
  saveFamilyNote,
  saveSummary,
  type SummaryActionResult,
} from "./summaryActions";

export interface PanelSummary {
  status: "draft" | "approved";
  content: SummaryContent;
  edited: boolean;
  familyNote: FamilyNote | null;
}

type Run = (action: (data: FormData) => Promise<SummaryActionResult>, data: FormData, done?: () => void) => void;

const card = "bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5";
const button = "font-bold text-sm px-4.5 py-2.5 rounded-full cursor-pointer border-none disabled:opacity-60";
const primary = `${button} bg-[var(--color-orange)] text-[var(--color-on-orange)]`;
const quiet = `${button} bg-[var(--color-neutral)] text-[var(--color-ink)]`;
const field = "w-full rounded-xl border border-[var(--color-neutral-border)] bg-[var(--color-surface)] text-[var(--color-ink)] text-sm p-3 font-[inherit]";

function Steps({ title, items }: { title: string; items: { title: string; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-xs font-extrabold uppercase text-[var(--color-muted)] mb-1">{title}</div>
      <ul className="m-0 pl-5 text-sm text-[var(--color-body)] leading-relaxed">
        {items.map((item) => <li key={item.title}><strong>{item.title}.</strong> {item.text}</li>)}
      </ul>
    </div>
  );
}

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

  const run: Run = (action, data, done) => {
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
  };
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
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">Headline
            <input name="headline" defaultValue={content.headline} className={`${field} mt-1`} required />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">Overview
            <textarea name="overview" defaultValue={content.overview} rows={3} className={`${field} mt-1`} required />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">What they can already do (one per line)
            <textarea name="canDo" defaultValue={listToLines(content.canDo)} rows={4} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">What they have not learned yet (one per line)
            <textarea name="notYet" defaultValue={listToLines(content.notYet)} rows={4} className={`${field} mt-1`} />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">First things first (three lines, each as Title: what to do)
            <textarea name="firstThings" defaultValue={titledToLines(content.firstThings)} rows={4} className={`${field} mt-1`} required />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">At school, the teacher will (one per line)
            <textarea name="atSchool" defaultValue={listToLines(content.atSchool)} rows={4} className={`${field} mt-1`} required />
          </label>
          <label className="text-sm font-bold text-[var(--color-ink-soft)]">At home, five minutes a day (each as Title: what to do)
            <textarea name="atHome" defaultValue={titledToLines(content.atHome)} rows={3} className={`${field} mt-1`} required />
          </label>
          <div className="flex gap-3 flex-wrap">
            <button type="submit" className={primary} disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
            <button type="button" className={quiet} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <p className="font-heading font-bold text-base text-[var(--color-ink)] m-0 mb-1">{content.headline}</p>
          <p className="text-sm text-[var(--color-body)] leading-relaxed m-0 mb-3">{content.overview}</p>
          <Points title="What they can already do" items={content.canDo} />
          <Points title="What they have not learned yet" items={content.notYet} />
          <Steps title="First things first" items={content.firstThings} />
          <Points title="At school, the teacher will" items={content.atSchool} />
          <Steps title="At home, five minutes a day" items={content.atHome} />
          <p className="text-xs text-[var(--color-muted)] m-0 mb-4">
            Drafted by AI from this assessment&apos;s scores{summary.edited ? " and edited by a teacher" : ""}. AI can make mistakes:
            the scores and bands above are the record.
          </p>
          <FamilyNoteBlock
            sessionId={sessionId}
            note={summary.familyNote}
            canEdit={canEdit}
            aiAvailable={aiAvailable}
            pending={pending}
            run={run}
          />
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

const LANGUAGE_CODES = Object.keys(FAMILY_LANGUAGES) as FamilyLanguage[];

/**
 * The summary's note for the family in Twi, Ga or Ewe (0023): written from
 * the summary above, checked by the teacher and approved with it, then
 * printed on a page of its own in the PDF to send home.
 */
function FamilyNoteBlock({
  sessionId,
  note,
  canEdit,
  aiAvailable,
  pending,
  run,
}: {
  sessionId: string;
  note: FamilyNote | null;
  canEdit: boolean;
  aiAvailable: boolean;
  pending: boolean;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const [language, setLanguage] = useState<FamilyLanguage>(note?.language ?? "tw");
  const write = (lang: FamilyLanguage) => {
    const data = new FormData();
    data.set("sessionId", sessionId);
    data.set("language", lang);
    run(generateFamilyNote, data);
  };
  const heading = <div className="text-xs font-extrabold uppercase text-[var(--color-muted)] mb-1">A note for the family</div>;
  const box = "border-t border-[var(--color-neutral-divider)] pt-4 mb-4";

  if (!note) {
    if (!canEdit || !aiAvailable) return null;
    return (
      <div className={box}>
        {heading}
        <p className="text-sm text-[var(--color-body)] m-0 mb-3">
          A short note in the family&apos;s language, made from the summary above, on its own page of the PDF to send home.
          AI writes these languages less well than English, so have someone who reads it check every word before you approve.
        </p>
        <div className="flex gap-3 flex-wrap items-center">
          <label className="text-sm font-bold text-[var(--color-ink-soft)] flex items-center gap-2">
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value as FamilyLanguage)} className={`${field} w-auto py-2`}>
              {LANGUAGE_CODES.map((code) => <option key={code} value={code}>{FAMILY_LANGUAGES[code]}</option>)}
            </select>
          </label>
          <button type="button" className={quiet} disabled={pending} onClick={() => write(language)}>
            {pending ? "Writing…" : "Write the family note"}
          </button>
        </div>
      </div>
    );
  }

  const name = FAMILY_LANGUAGES[note.language];
  if (editing && canEdit) {
    return (
      <form
        className={`${box} flex flex-col gap-3`}
        onSubmit={(event) => {
          event.preventDefault();
          run(saveFamilyNote, new FormData(event.currentTarget), () => setEditing(false));
        }}
      >
        {heading}
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="language" value={note.language} />
        <label className="text-sm font-bold text-[var(--color-ink-soft)]">Note to the family, in {name}
          <textarea name="text" lang={note.language} defaultValue={note.text} rows={4} className={`${field} mt-1`} required />
        </label>
        <label className="text-sm font-bold text-[var(--color-ink-soft)]">At home, in {name} (each as Title: what to do)
          <textarea name="atHome" lang={note.language} defaultValue={titledToLines(note.atHome)} rows={3} className={`${field} mt-1`} required />
        </label>
        <div className="flex gap-3 flex-wrap">
          <button type="submit" className={primary} disabled={pending}>{pending ? "Saving…" : "Save note"}</button>
          <button type="button" className={quiet} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className={box}>
      {heading}
      <p className="text-xs font-bold text-[var(--color-muted)] m-0 mb-2">In {name}</p>
      <div lang={note.language}>
        <p className="text-sm text-[var(--color-body)] leading-relaxed m-0 mb-2">{note.text}</p>
        <ul className="m-0 pl-5 text-sm text-[var(--color-body)] leading-relaxed mb-3">
          {note.atHome.map((p) => <li key={p.title}><strong>{p.title}.</strong> {p.text}</li>)}
        </ul>
      </div>
      {canEdit && (
        <>
          <p className="text-xs text-[var(--color-muted)] m-0 mb-3">
            Made by AI from the summary. Have someone who reads {name} check it before you approve. If you change the summary, write the note again.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button type="button" className={quiet} disabled={pending} onClick={() => setEditing(true)}>Edit note</button>
            {aiAvailable && (
              <button
                type="button"
                className={quiet}
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Write the ${name} note again? This replaces the note above, including any edits.`)) write(note.language);
                }}
              >
                Write it again
              </button>
            )}
            <button
              type="button"
              className={quiet}
              disabled={pending}
              onClick={() => {
                if (window.confirm("Remove the family note?")) {
                  const data = new FormData();
                  data.set("sessionId", sessionId);
                  run(removeFamilyNote, data);
                }
              }}
            >
              Remove note
            </button>
          </div>
        </>
      )}
    </div>
  );
}
