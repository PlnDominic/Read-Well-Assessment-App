"use client";

import { useActionState } from "react";
import { addStudentToOwnRoster, type AddStudentState } from "./actions";
import { LEVEL_OPTIONS, levelLabel } from "@/lib/levels";

const initialState: AddStudentState = { error: null, result: null };

export function AddStudentForm() {
  const [state, formAction, isPending] = useActionState(addStudentToOwnRoster, initialState);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[160px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Add a student</span>
          <input
            name="name"
            placeholder="Student name"
            required
            className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5"
          />
        </label>
        <select
          name="level"
          aria-label="Level"
          defaultValue={1}
          className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5 text-sm"
        >
          {LEVEL_OPTIONS.map((l) => (
            <option key={l} value={l}>
              {levelLabel(l)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="bg-[var(--color-orange)] text-[var(--color-on-orange)] border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-4.5 py-2.5 cursor-pointer disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </form>

      {state.error && <p className="text-[var(--color-orange-dark)] text-sm mt-3 mb-0">{state.error}</p>}

      {state.result && (
        <div className="mt-3.5 bg-[var(--color-orange-tint)] rounded-xl px-4.5 py-3.5 text-sm text-[var(--color-ink-soft)]">
          <strong>{state.result.name}</strong> added. Start their assessment from the class list when you&apos;re
          ready.
        </div>
      )}
    </div>
  );
}
