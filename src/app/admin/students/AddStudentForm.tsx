"use client";

import { useActionState } from "react";
import { addStudent, type AddStudentState } from "./actions";
import { LEVEL_OPTIONS, levelLabel } from "@/lib/levels";

const initialState: AddStudentState = { error: null, result: null };

export function AddStudentForm({ teachers }: { teachers: { id: string; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(addStudent, initialState);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-3.5">
        <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[180px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Name</span>
          <input name="name" required className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm w-28">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Level</span>
          <select
            name="level"
            defaultValue={1}
            required
            className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5"
          >
            {LEVEL_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {levelLabel(l)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[180px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Teacher</span>
          <select name="teacherId" required className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5">
            {teachers.length === 0 && <option value="">No teachers yet</option>}
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={teachers.length === 0 || isPending}
          className="bg-[var(--color-orange)] text-[var(--color-on-orange)] border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-5 py-2.75 cursor-pointer disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add student"}
        </button>
      </form>
      {teachers.length === 0 && (
        <p className="text-[var(--color-muted)] text-sm mt-3 mb-0">
          Add a teacher in Staff first.
        </p>
      )}

      {state.error && <p className="text-[var(--color-orange-dark)] text-sm mt-3 mb-0">{state.error}</p>}

      {state.result && (
        <div className="mt-4 bg-[var(--color-orange-tint)] rounded-xl px-4.5 py-3.5 text-sm text-[var(--color-ink-soft)]">
          <strong>{state.result.name}</strong> added. Their teacher starts each assessment from the class list.
        </div>
      )}
    </div>
  );
}
