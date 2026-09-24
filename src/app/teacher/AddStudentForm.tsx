"use client";

import { useActionState } from "react";
import { addStudentToOwnRoster, type AddStudentState } from "./actions";

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
            className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5"
          />
        </label>
        <select
          name="grade"
          defaultValue={1}
          className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5 text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-4.5 py-2.5 cursor-pointer disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </form>

      {state.error && <p className="text-[var(--color-terracotta-dark)] text-sm mt-3 mb-0">{state.error}</p>}

      {state.result && (
        <div className="mt-3.5 bg-[var(--color-sage-tint)] rounded-xl px-4.5 py-3.5 text-sm text-[var(--color-ink-soft)]">
          <strong>{state.result.name}</strong> added.{" "}
          {state.result.sessionCode ? (
            <>
              Kiosk code (give this to the student to enter at /student/join):{" "}
              <code className="bg-white px-2 py-1 rounded font-bold">{state.result.sessionCode}</code>
            </>
          ) : (
            state.result.note
          )}
        </div>
      )}
    </div>
  );
}
