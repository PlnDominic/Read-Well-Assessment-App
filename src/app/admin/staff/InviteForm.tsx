"use client";

import { useActionState } from "react";
import { inviteStaff, type InviteStaffState } from "./actions";

const initialState: InviteStaffState = { error: null, result: null };

export function InviteForm() {
  const [state, formAction, isPending] = useActionState(inviteStaff, initialState);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-3.5">
        <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[160px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Name</span>
          <input name="name" required className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[200px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Email</span>
          <input
            name="email"
            type="email"
            required
            className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm min-w-[170px]">
          <span className="font-bold text-[var(--color-muted)] text-xs uppercase">Role</span>
          <select name="role" required defaultValue="teacher" className="border-2 border-[var(--color-neutral-border)] rounded-xl px-3.5 py-2.5">
            <option value="teacher">Teacher</option>
            <option value="reading_specialist">Reading Specialist</option>
            <option value="administrator">Administrator</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="bg-[var(--color-orange)] text-white border-none rounded-full font-bold text-sm shadow-[0_6px_16px_rgba(74,107,82,0.25)] transition-transform hover:-translate-y-0.5 px-5 py-2.75 cursor-pointer disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Invite staff member"}
        </button>
      </form>

      {state.error && <p className="text-[var(--color-orange-dark)] text-sm mt-3 mb-0">{state.error}</p>}

      {state.result && (
        <div className="mt-4 bg-[var(--color-orange-tint)] rounded-xl px-4.5 py-3.5 text-sm text-[var(--color-ink-soft)]">
          Account created for <strong>{state.result.email}</strong>. Temporary password (shown once; share it
          securely with them):{" "}
          <code className="bg-[var(--color-surface)] px-2 py-1 rounded font-bold">{state.result.tempPassword}</code>
        </div>
      )}
    </div>
  );
}
