"use client";

import { useActionState, useState } from "react";
import { addRecommendationRule, type ActionResult } from "../actions";

const inputClass =
  "w-full border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm bg-[var(--color-surface)] text-[var(--color-ink)] focus:border-[var(--color-orange)] focus:outline-none";

export function AddRecommendationForm({ level, skillAreas }: { level: number; skillAreas: { id: string; name: string }[] }) {
  const empty = { skillAreaId: "", text: "", programReference: "" };
  const [values, setValues] = useState(empty);
  // What was typed stays after a mistake, and clears once it's added.
  const [result, add, adding] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const next = await addRecommendationRule(prev, formData);
    if (next?.ok) setValues(empty);
    return next;
  }, null);

  return (
    <form action={add} className="flex flex-col gap-3">
      <input type="hidden" name="level" value={level} />
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">When a child is flagged in</span>
        <select
          name="skillAreaId"
          required
          value={values.skillAreaId}
          onChange={(e) => setValues({ ...values, skillAreaId: e.target.value })}
          className={`${inputClass} sm:max-w-[320px]`}
        >
          <option value="" disabled>
            Pick a skill area…
          </option>
          {skillAreas.map((sa) => (
            <option key={sa.id} value={sa.id}>
              {sa.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">The teacher should</span>
        <textarea
          name="text"
          required
          rows={2}
          value={values.text}
          onChange={(e) => setValues({ ...values, text: e.target.value })}
          placeholder="e.g. Practise letter sounds for 10 minutes a day with sound cards."
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">From which programme? (optional)</span>
        <input
          name="programReference"
          value={values.programReference}
          onChange={(e) => setValues({ ...values, programReference: e.target.value })}
          placeholder="e.g. ReadWell Teacher Guide, Unit 3"
          className={inputClass}
        />
      </label>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={adding}
          className="rounded-full border-0 bg-[var(--color-orange)] px-5 py-2 text-sm font-bold text-white cursor-pointer shadow-[0_6px_16px_rgba(234,88,12,0.25)] disabled:opacity-60"
        >
          {adding ? "Adding…" : "Add next step"}
        </button>
        {result && (
          <span role="status" className="text-sm font-bold" style={{ color: result.ok ? "var(--color-ink)" : "var(--color-orange-dark)" }}>
            {result.ok ? `✓ ${result.message}` : result.message}
          </span>
        )}
      </div>
    </form>
  );
}
