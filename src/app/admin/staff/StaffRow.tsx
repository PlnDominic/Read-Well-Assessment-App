"use client";

import { useActionState } from "react";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  deactivateStaff,
  reactivateStaff,
  resetStaffPassword,
  updateStaffRole,
  type ResetPasswordState,
} from "./actions";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  reading_specialist: "Reading Specialist",
  administrator: "Administrator",
};

const initialResetState: ResetPasswordState = { error: null, result: null };

export function StaffRow({
  staffMember,
  isSelf,
}: {
  staffMember: { id: string; name: string; email: string; role: string; is_active: boolean };
  isSelf: boolean;
}) {
  const [resetState, resetAction, isResetting] = useActionState(resetStaffPassword, initialResetState);

  return (
    <div className="px-6 py-4 border-b border-[var(--color-neutral-divider)] last:border-b-0 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-extrabold text-[var(--color-ink)] text-base">
            {staffMember.name} {isSelf && <span className="text-[var(--color-muted-light)] text-xs">(you)</span>}
          </div>
          <div className="text-[13px] text-[var(--color-muted-light)]">{staffMember.email}</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!staffMember.is_active && (
            <span className="bg-[var(--color-orange-tint)] text-[var(--color-orange-dark)] text-xs font-bold px-3 py-1.5 rounded-full">
              Deactivated
            </span>
          )}

          {isSelf ? (
            <span className="bg-[var(--color-orange-tint)] text-[var(--color-orange-dark)] text-xs font-bold px-3 py-1.5 rounded-full">
              {ROLE_LABELS[staffMember.role] ?? staffMember.role}
            </span>
          ) : (
            <form action={updateStaffRole} className="flex items-center gap-1.5">
              <input type="hidden" name="id" value={staffMember.id} />
              <select
                name="role"
                aria-label={`Role for ${staffMember.name}`}
                defaultValue={staffMember.role}
                className="border-2 border-[var(--color-neutral-border)] rounded-full px-3 py-1.5 text-xs"
              >
                <option value="teacher">Teacher</option>
                <option value="reading_specialist">Reading Specialist</option>
                <option value="administrator">Administrator</option>
              </select>
              <button
                type="submit"
                className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] transition-colors hover:bg-[var(--color-neutral-divider)] font-bold text-xs px-3 py-1.5 rounded-full cursor-pointer"
              >
                Save
              </button>
            </form>
          )}

          <form action={resetAction}>
            <input type="hidden" name="id" value={staffMember.id} />
            <input type="hidden" name="email" value={staffMember.email} />
            <button
              type="submit"
              disabled={isResetting}
              className="bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] transition-colors hover:bg-[var(--color-neutral-divider)] font-bold text-xs px-3 py-1.5 rounded-full cursor-pointer disabled:opacity-60"
            >
              {isResetting ? "Resetting…" : "Reset password"}
            </button>
          </form>

          {!isSelf &&
            (staffMember.is_active ? (
              <form action={deactivateStaff}>
                <input type="hidden" name="id" value={staffMember.id} />
                <ConfirmSubmitButton
                  confirmMessage={`Deactivate ${staffMember.name}? They won't be able to sign in until reactivated.`}
                  className="text-[var(--color-orange-dark)] text-xs font-bold bg-none border-none cursor-pointer"
                >
                  Deactivate
                </ConfirmSubmitButton>
              </form>
            ) : (
              <form action={reactivateStaff}>
                <input type="hidden" name="id" value={staffMember.id} />
                <button
                  type="submit"
                  className="text-[var(--color-orange-dark)] text-xs font-bold bg-none border-none cursor-pointer"
                >
                  Reactivate
                </button>
              </form>
            ))}
        </div>
      </div>

      {resetState.error && <p className="text-[var(--color-orange-dark)] text-xs m-0">{resetState.error}</p>}
      {resetState.result && (
        <div className="bg-[var(--color-orange-tint)] rounded-lg px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
          New temporary password (shown once; share it securely):{" "}
          <code className="bg-[var(--color-surface)] px-1.5 py-0.5 rounded font-bold">{resetState.result.tempPassword}</code>
        </div>
      )}
    </div>
  );
}
