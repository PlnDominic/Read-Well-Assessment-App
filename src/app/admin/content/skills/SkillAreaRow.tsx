"use client";

import { useActionState, useState } from "react";
import { addSkillArea, deleteSkillArea, saveSkillArea, type ActionResult } from "../actions";

const inputClass =
  "w-full border-2 border-[var(--color-neutral-border)] rounded-xl px-3 py-2 text-sm bg-[var(--color-surface)] text-[var(--color-ink)] focus:border-[var(--color-orange)] focus:outline-none";

/** One skill area: its name, how much it counts and its flag line, saved together. */
export function SkillAreaRow({
  id,
  name,
  weight,
  flaggedThreshold,
  defaultThreshold,
  usage,
  canDelete,
}: {
  id: string;
  name: string;
  weight: number;
  flaggedThreshold: number | null;
  defaultThreshold: number;
  usage: string;
  canDelete: boolean;
}) {
  const saved = { name, weight: String(weight), threshold: flaggedThreshold === null ? "" : String(flaggedThreshold) };
  const [values, setValues] = useState(saved);
  const [result, save, saving] = useActionState(saveSkillArea, null);
  const [deleteResult, remove, deleting] = useActionState(deleteSkillArea, null);
  const changed = values.name !== saved.name || values.weight !== saved.weight || values.threshold !== saved.threshold;
  const message = deleteResult && !deleteResult.ok ? deleteResult : changed ? null : result;

  return (
    <form action={save} className="grid gap-x-3 gap-y-2 px-2 py-3 md:grid-cols-[minmax(0,1fr)_96px_116px_150px] md:items-start">
      <input type="hidden" name="id" value={id} />
      <div className="min-w-0">
        <input
          name="name"
          aria-label="Skill area name"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          required
          className={`${inputClass} font-bold`}
        />
        <div className="text-xs text-[var(--color-muted)] mt-1 px-1">{usage}</div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="md:sr-only text-xs font-bold uppercase text-[var(--color-muted)]">Counts</span>
        <input
          name="weight"
          type="number"
          min="0.1"
          step="0.1"
          value={values.weight}
          onChange={(e) => setValues({ ...values, weight: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="md:sr-only text-xs font-bold uppercase text-[var(--color-muted)]">Flag below</span>
        <span className="relative">
          <input
            name="flaggedThreshold"
            type="number"
            min="0"
            max="100"
            placeholder={String(defaultThreshold)}
            value={values.threshold}
            onChange={(e) => setValues({ ...values, threshold: e.target.value })}
            className={`${inputClass} pr-8`}
          />
          <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted)]">
            %
          </span>
        </span>
      </label>
      <div className="flex items-center gap-2 flex-wrap md:pt-1">
        <button
          type="submit"
          disabled={!changed || saving}
          className="rounded-full border-0 bg-[var(--color-orange)] px-4 py-1.5 text-sm font-bold text-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {canDelete && (
          <button
            type="submit"
            formAction={remove}
            disabled={deleting}
            onClick={(e) => {
              if (!window.confirm(`Delete the skill area “${name}”?`)) e.preventDefault();
            }}
            className="border-0 bg-transparent p-0 text-sm font-bold text-[var(--color-orange-dark)] cursor-pointer"
          >
            Delete
          </button>
        )}
      </div>
      {message && (
        <p
          role="status"
          className="md:col-span-4 m-0 px-1 text-sm font-bold"
          style={{ color: message.ok ? "var(--color-ink)" : "var(--color-orange-dark)" }}
        >
          {message.ok ? `✓ ${message.message}` : message.message}
        </p>
      )}
    </form>
  );
}

export function AddSkillAreaForm() {
  const [name, setName] = useState("");
  // The name stays put after a mistake, and clears once it's added.
  const [result, add, adding] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const next = await addSkillArea(prev, formData);
    if (next?.ok) setName("");
    return next;
  }, null);
  return (
    <form action={add} className="flex flex-wrap items-start gap-2.5">
      <label className="flex-1 min-w-[220px]">
        <span className="sr-only">Name</span>
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Oral language"
          className={inputClass}
        />
      </label>
      <button
        type="submit"
        disabled={adding}
        className="rounded-full border-0 bg-[var(--color-orange)] px-5 py-2 text-sm font-bold text-white cursor-pointer shadow-[0_6px_16px_rgba(234,88,12,0.25)] disabled:opacity-60"
      >
        {adding ? "Adding…" : "Add skill area"}
      </button>
      {result && (
        <p
          role="status"
          className="basis-full m-0 text-sm font-bold"
          style={{ color: result.ok ? "var(--color-ink)" : "var(--color-orange-dark)" }}
        >
          {result.ok ? `✓ ${result.message}` : result.message}
        </p>
      )}
    </form>
  );
}
