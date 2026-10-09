"use client";

import { scoreOf, type Answers } from "@/lib/readwell/flow";

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-6 py-6 sm:px-8 mb-5">{children}</div>
  );
}

/** Two big buttons per item: right, or wrong / no answer. Tapping the chosen one again clears it. */
export function RightWrong({ itemId, maxScore = 1, answers, setMarks }: { itemId: string; maxScore?: number; answers: Answers; setMarks: (m: Answers) => void }) {
  const score = scoreOf(answers, itemId);
  const options = maxScore === 1 ? [1, 0] : Array.from({ length: maxScore + 1 }, (_, i) => maxScore - i);
  return (
    <div className="flex gap-2 shrink-0">
      {options.map((value) => {
        const selected = score === value;
        const label = maxScore === 1 ? (value === 1 ? "✓ Right" : "✗ Wrong") : `${value}`;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => setMarks({ [itemId]: selected ? null : value })}
            className="font-bold text-sm px-4 py-2.5 rounded-xl cursor-pointer min-w-[88px]"
            style={{
              border: `2px solid ${selected ? (value > 0 ? "var(--color-ink)" : "var(--color-orange)") : "var(--color-neutral-border)"}`,
              background: selected ? (value > 0 ? "var(--color-ink)" : "var(--color-orange)") : "var(--color-surface)",
              color: selected ? "var(--color-surface)" : "var(--color-ink)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
