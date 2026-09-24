"use client";

import { useActionState } from "react";
import { addStudent, type AddStudentState } from "./actions";

const initialState: AddStudentState = { error: null, result: null };

export function AddStudentForm({ teachers }: { teachers: { id: string; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(addStudent, initialState);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-3.5">
        <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[180px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Name</span>
          <input name="name" required className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm w-24">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Grade</span>
          <input
            name="grade"
            type="number"
            defaultValue={1}
            min={1}
            max={12}
            required
            className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[180px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Teacher</span>
          <select name="teacherId" required className="border-2 border-[var(--color-cream-border)] rounded-xl px-3.5 py-2.5">
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
          className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-5 py-2.75 cursor-pointer disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add student"}
        </button>
      </form>
      {teachers.length === 0 && (
        <p className="text-[var(--color-muted)] text-sm mt-3 mb-0">
          Add a teacher on the Staff tab first. Students need one assigned.
        </p>
      )}

      {state.error && <p className="text-[var(--color-terracotta-dark)] text-sm mt-3 mb-0">{state.error}</p>}

      {state.result && (
        <div className="mt-4 bg-[var(--color-sage-tint)] rounded-xl px-4.5 py-3.5 text-sm text-[var(--color-ink-soft)]">
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
