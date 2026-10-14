import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { LEVEL_OPTIONS, levelLabel } from "@/lib/levels";

/**
 * The top of every Content page: its title and one line on what it is for.
 * The three pages are in the sidebar, so there are no tabs here.
 */
export type ContentTab = "assessments" | "recommendations" | "skills";

const TITLES: Record<ContentTab, string> = {
  assessments: "Assessments",
  recommendations: "Recommendations",
  skills: "Skills and scoring",
};

export function ContentHeader({ tab, intro }: { tab: ContentTab; intro: React.ReactNode }) {
  return <PageHeader title={TITLES[tab]} subtitle={intro} />;
}

/** Level buttons for the tabs that show one level at a time, with a short note under each. */
export function LevelPicker({
  level,
  basePath,
  notes = {},
}: {
  level: number;
  basePath: string;
  notes?: Record<number, string>;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-6">
      <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Level</span>
      <div className="flex gap-2 flex-wrap">
        {LEVEL_OPTIONS.map((l) => {
          const active = l === level;
          return (
            <Link
              key={l}
              href={`${basePath}?level=${l}`}
              aria-current={active ? "page" : undefined}
              className="min-w-[78px] rounded-xl border-2 px-3 py-1.5 text-center no-underline transition-colors"
              style={{
                borderColor: active ? "var(--color-orange)" : "var(--color-neutral-border)",
                background: active ? "var(--color-orange-tint)" : "var(--color-surface)",
              }}
            >
              <span className="block font-bold text-sm text-[var(--color-ink)]">{levelLabel(l)}</span>
              {notes[l] && <span className="block text-[11px] text-[var(--color-muted)]">{notes[l]}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** "Ready" or "Not yet", the same everywhere on Content. */
export function StatusPill({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap"
      style={{
        background: ready ? "var(--color-orange-tint)" : "var(--color-neutral)",
        color: ready ? "var(--color-orange-dark)" : "var(--color-muted)",
      }}
    >
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ background: ready ? "var(--color-orange)" : "var(--color-neutral-border-strong)" }}
      />
      {children}
    </span>
  );
}

/** The page's level from ?level=, defaulting to Level 1. */
export function levelFromParam(raw: string | undefined): number {
  return raw && LEVEL_OPTIONS.includes(Number(raw)) ? Number(raw) : 1;
}

export const cardClass = "bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)]";
