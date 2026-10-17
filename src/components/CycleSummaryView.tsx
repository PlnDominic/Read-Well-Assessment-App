import type { CycleSummaryContent } from "@/lib/cycleSummary";

const label = "text-xs font-extrabold uppercase text-[var(--color-muted)] mb-1";
const list = "m-0 pl-5 text-sm text-[var(--color-body)] leading-relaxed";

/** A cycle's summary for the school or a class (0023), as read on screen. */
export function CycleSummaryView({ content }: { content: CycleSummaryContent }) {
  return (
    <>
      <p className="font-heading font-bold text-base text-[var(--color-ink)] m-0 mb-1">{content.headline}</p>
      <p className="text-sm text-[var(--color-body)] leading-relaxed m-0 mb-3">{content.overview}</p>
      {content.strengths.length > 0 && (
        <div className="mb-3">
          <div className={label}>Going well</div>
          <ul className={list}>
            {content.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      <div className="mb-3">
        <div className={label}>Work on first</div>
        <ol className={list}>
          {content.priorities.map((p, i) => <li key={i}><strong>{p.title}.</strong> {p.text}</li>)}
        </ol>
      </div>
      <div className="mb-3">
        <div className={label}>Next steps</div>
        <ul className={list}>
          {content.actions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </div>
    </>
  );
}
