import { shortCode, type FormDef } from "@/lib/readwell/form";
import { scoreOf, type Answers, type PartFlow } from "@/lib/readwell/flow";
import type { FormSummary } from "@/lib/readwell/score";
import { saveWritingScores } from "./actions";

/**
 * Report sections for assessor-led forms (ReadWell Level 1, KG 1), from
 * the guide's "Scoring and bands": each strand on its own with its raw
 * score and band, never one total, so the report shows exactly where the
 * child is stuck.
 */

const card = "bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-8 py-7.5 mb-5";
const heading = "font-heading font-bold text-sm text-[var(--color-ink)]";

export function StrandTable({ summary }: { summary: FormSummary }) {
  return (
    <>
      <div className={`${heading} mb-3.5`}>Strands</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--color-muted)] text-xs uppercase">
              <th className="py-2 pr-3">Strand</th>
              <th className="py-2 pr-3">Score</th>
              <th className="py-2">Band</th>
            </tr>
          </thead>
          <tbody>
            {summary.strands.map((s) => (
              <tr key={s.key} className="border-t border-[var(--color-neutral-divider)] align-top">
                <td className="py-2.5 pr-3 font-bold text-[var(--color-ink-soft)]">
                  {s.name}
                  {s.parts.length > 1 && s.status === "scored" && (
                    <div className="text-xs font-normal text-[var(--color-muted)]">
                      {s.parts.map((p) => `${p.title} ${p.status === "skipped" ? "NA" : `${p.raw}/${p.max}`}`).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="py-2.5 pr-3 font-bold text-[var(--color-ink)] whitespace-nowrap">
                  {s.status === "na" ? "NA" : s.status === "notEntered" ? "Not entered" : `${s.raw} / ${s.max}`}
                </td>
                <td className="py-2.5">
                  {s.band ? (
                    <span
                      className="font-bold text-xs px-2.5 py-1 rounded-full"
                      style={{
                        background: s.band === "Emerging" ? "var(--color-orange-tint)" : "var(--color-neutral)",
                        color: s.band === "Emerging" ? "var(--color-orange-dark)" : "var(--color-ink)",
                      }}
                    >
                      {s.band}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">
                      {s.status === "na"
                        ? s.parts.find((p) => p.note)?.note ?? "Skipped by a gate rule"
                        : s.status === "notEntered"
                          ? "Score the writing sheet below."
                          : s.bandNote}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--color-muted)] m-0 mt-3">
        The support level counts how many of the six foundation strands (story listening, vocabulary, print concepts,
        sound awareness, letter names and letter sounds) are Emerging: {summary.emergingFoundation} of{" "}
        {summary.bandedFoundation} banded here. 0 or 1 is on track, 2 to 4 needs support, 5 or 6 needs urgent support.
        Cut points are provisional until the pilot.
      </p>
    </>
  );
}

export function StoryAndAttitude({ summary }: { summary: FormSummary }) {
  const story = summary.storyReading;
  return (
    <div className={card}>
      <div className={`${heading} mb-2`}>Story reading</div>
      <p className="text-sm text-[var(--color-body)] m-0 mb-5">
        {story
          ? `${story.wordsCorrect} words correct out of ${story.outOf} (${story.attempted} attempted, ${story.errors} errors)` +
            (story.wcpm !== null ? `, ${story.wcpm} words correct per minute in ${story.seconds} seconds.` : ".")
          : "Not given: a gate rule skipped it."}{" "}
        No band is set for these until the pilot gives real numbers.
      </p>

      <div className={`${heading} mb-2`}>Reading attitude (not scored)</div>
      <ul className="text-sm text-[var(--color-body)] m-0 pl-5 mb-1 list-disc">
        {summary.attitude.map((a) => (
          <li key={a.itemId}>
            {a.prompt} <strong>{a.answer ?? "No answer"}</strong>
          </li>
        ))}
      </ul>

      {summary.rulesApplied.length > 0 && (
        <>
          <div className={`${heading} mb-2 mt-5`}>Rules applied</div>
          <ul className="text-sm text-[var(--color-body)] m-0 pl-5 list-disc">
            {summary.rulesApplied.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Part 13 is given to a group on paper and scored afterwards; the scores are typed in here. */
export function WritingScores({ form, answers, sessionId, canEdit }: { form: FormDef; answers: Answers; sessionId: string; canEdit: boolean }) {
  const items = form.items.filter((i) => i.part === 13);
  const entered = items.filter((i) => scoreOf(answers, i.id) !== undefined).length;
  return (
    <div className={card}>
      <div className={`${heading} mb-1.5`}>Part 13: Writing (scored from the writing sheet)</div>
      <p className="text-sm text-[var(--color-muted)] m-0 mb-4">
        {entered === 0 ? "Not entered yet." : `${entered} of ${items.length} entered.`} Saving updates the report and
        the school report.
      </p>
      {canEdit ? (
        <form action={saveWritingScores} className="flex flex-col gap-2.5">
          <input type="hidden" name="sessionId" value={sessionId} />
          {items.map((item) => {
            const score = scoreOf(answers, item.id);
            const max = item.maxScore ?? 1;
            return (
              <label key={item.id} className="flex justify-between items-center gap-3 flex-wrap text-sm border-b border-[var(--color-neutral-divider)] pb-2.5">
                <span className="flex-1 min-w-[220px]">
                  <span className="text-[11px] font-extrabold text-[var(--color-muted)] mr-2">{shortCode(item.id)}</span>
                  <span className="font-bold text-[var(--color-ink-soft)]">{item.prompt}</span>
                  {item.detail && <span className="text-[var(--color-muted)]"> · {item.detail}</span>}
                  {item.accept && <span className="block text-xs text-[var(--color-body)]">{max > 1 ? item.accept : `Correct: ${item.accept}`}</span>}
                </span>
                <select
                  name={item.id}
                  defaultValue={score === undefined ? "" : String(score)}
                  className="border-2 border-[var(--color-neutral-border)] rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="">Not scored</option>
                  {Array.from({ length: max + 1 }, (_, v) => max - v).map((v) => (
                    <option key={v} value={v}>
                      {max === 1 ? (v === 1 ? "1 (correct)" : "0") : String(v)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <button
            type="submit"
            className="self-start bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-sm px-5 py-2.5 cursor-pointer mt-2"
          >
            Save writing scores
          </button>
        </form>
      ) : (
        <p className="text-sm text-[var(--color-body)] m-0">Only the class teacher or an administrator can enter writing scores.</p>
      )}
    </div>
  );
}

/** Every mark, part by part, as the score sheet would show it. */
export function ItemMarks({ form, answers, flows }: { form: FormDef; answers: Answers; flows: PartFlow[] }) {
  return (
    <div className={card}>
      <div className={`${heading} mb-3`}>Item marks</div>
      <div className="flex flex-col gap-2">
        {form.parts
          .filter((p) => p.number !== 13 && p.kind !== "attitude")
          .map((part) => {
            const flow = flows.find((f) => f.number === part.number)!;
            const items = form.items.filter((i) => i.part === part.number && i.scored !== false);
            const active = new Set(flow.activeItemIds);
            return (
              <details key={part.number} className="bg-[var(--color-neutral)] rounded-xl px-4 py-2.5">
                <summary className="cursor-pointer text-sm font-bold text-[var(--color-ink-soft)]">
                  Part {part.number}: {part.title}
                  {flow.skipped && <span className="font-normal text-[var(--color-muted)]"> · NA ({flow.skipped.by})</span>}
                  {flow.stopped && <span className="font-normal text-[var(--color-muted)]"> · stopped ({flow.stopped.by})</span>}
                </summary>
                {!flow.skipped && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {items.map((item) => {
                      const score = scoreOf(answers, item.id);
                      const given = active.has(item.id);
                      return (
                        <span
                          key={item.id}
                          title={item.prompt}
                          className="text-xs font-bold px-2 py-1 rounded-md"
                          style={{
                            background: !given ? "transparent" : score ? "var(--color-ink)" : "var(--color-orange-tint)",
                            color: !given ? "var(--color-muted-light)" : score ? "var(--color-surface)" : "var(--color-orange-dark)",
                            border: given ? "none" : "1px dashed var(--color-neutral-border-strong)",
                          }}
                        >
                          {shortCode(item.id)} {part.kind === "grid" ? item.prompt : ""} {!given ? "–" : score ? "✓" : "✗"}
                        </span>
                      );
                    })}
                  </div>
                )}
              </details>
            );
          })}
      </div>
    </div>
  );
}
