"use client";

import { useState, useTransition } from "react";

/**
 * The explicit-override half of PRD §4.1's "blocked or requires explicit
 * override with a warning": grade-matching is the default everywhere else
 * (createSessionForStudent always picks the assessment matching the
 * student's own grade), and this is the one deliberate escape hatch,
 * gated behind a confirm dialog that names exactly what it's about to do.
 *
 * Only shown for a not-yet-started session (see teacher/page.tsx) --
 * overriding an in-progress one would silently discard answers already
 * recorded against the original assessment's items, and overriding a
 * completed one doesn't mean anything (see validateGradeOverride in
 * lib/kiosk.ts, which also enforces both server-side).
 */
export function GradeOverrideControl({
  studentId,
  studentName,
  currentGrade,
  action,
}: {
  studentId: string;
  studentName: string;
  currentGrade: number;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(currentGrade === 1 ? 2 : 1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[var(--color-muted)] text-xs font-bold bg-none border-none cursor-pointer underline"
      >
        Override grade…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="flex items-center gap-2 flex-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          // The explicit warning PRD §4.1 requires before an override takes effect.
          const warning = `This starts ${studentName}'s next assessment with Grade ${grade} content instead of the automatically matched Grade ${currentGrade} content, bypassing the normal grade-matching safeguard. Continue?`;
          if (!window.confirm(warning)) return;

          const fd = new FormData();
          fd.set("studentId", studentId);
          fd.set("gradeLevel", String(grade));
          startTransition(async () => {
            try {
              await action(fd);
              setOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            }
          });
        }}
      >
        <select
          value={grade}
          onChange={(e) => setGrade(Number(e.target.value))}
          aria-label={`Override grade for ${studentName}`}
          className="border-2 border-[var(--color-neutral-border)] rounded-lg px-2 py-1 text-xs"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="bg-[var(--color-orange-tint)] border-none text-[var(--color-orange-dark)] font-bold text-xs px-3 py-1.5 rounded-full cursor-pointer disabled:opacity-60"
        >
          {pending ? "Overriding…" : "Confirm override"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[var(--color-muted)] text-xs font-bold bg-none border-none cursor-pointer"
        >
          Cancel
        </button>
      </form>
      {error && <span className="text-[var(--color-orange-dark)] text-xs font-bold">{error}</span>}
    </div>
  );
}
