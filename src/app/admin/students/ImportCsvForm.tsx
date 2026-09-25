"use client";

import { useActionState } from "react";
import { importStudentsCsv, type ImportCsvState } from "./actions";

const initialState: ImportCsvState = { error: null, summary: null };

export function ImportCsvForm() {
  const [state, formAction, isPending] = useActionState(importStudentsCsv, initialState);

  return (
    <div className="border-t border-[var(--color-neutral-divider)] pt-5 mt-5">
      <div className="font-heading font-bold text-sm text-[var(--color-ink)] mb-1.5">Bulk import (CSV)</div>
      <p className="text-[var(--color-muted)] text-xs mb-3 mt-0">
        Header row <code>name,grade,teacher_email</code>, one student per line, teacher matched by email.
      </p>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="sr-only">CSV file</span>
          <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] transition-colors hover:bg-[var(--color-neutral-divider)] font-bold text-xs px-4 py-2 rounded-full cursor-pointer disabled:opacity-60"
        >
          {isPending ? "Importing…" : "Import"}
        </button>
      </form>

      {state.error && <p className="text-[var(--color-orange-dark)] text-sm mt-3 mb-0">{state.error}</p>}

      {state.summary && (
        <div className="mt-3">
          <p className="text-[var(--color-orange-dark)] text-sm font-bold m-0">
            Imported {state.summary.inserted} student{state.summary.inserted === 1 ? "" : "s"}.
          </p>
          {state.summary.rowErrors.length > 0 && (
            <ul className="text-[var(--color-orange-dark)] text-xs mt-1.5 pl-4 list-disc">
              {state.summary.rowErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
