"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { submitted: false };

export function ForgotForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);

  if (state.submitted) {
    return (
      <div className="w-full max-w-[420px] mt-[10vh] text-center">
        <h1 className="font-heading font-bold text-2xl text-[var(--color-ink)] m-0 mb-3">Check your email</h1>
        <p className="text-[var(--color-body)] text-sm mb-6">
          If that email has an account, a reset link is on its way. Follow it to set a new password.
        </p>
        <Link href="/login" className="text-[var(--color-orange)] font-bold text-sm no-underline hover:underline">
          &larr; Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[420px] mt-[10vh]">
      <h1 className="font-heading font-bold text-2xl text-[var(--color-ink)] m-0 mb-1.5">Reset your password</h1>
      <p className="text-[var(--color-body)] text-sm m-0 mb-6">
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>
      <form action={formAction} className="flex flex-col gap-4">
        <input
          type="email"
          name="email"
          required
          placeholder="you@school.edu"
          className="border-2 border-[var(--color-neutral-border)] rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[var(--color-orange)]"
        />
        <button
          type="submit"
          disabled={isPending}
          className="bg-[var(--color-orange)] text-white border-none rounded-full font-heading font-bold text-lg py-3.5 cursor-pointer disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <Link href="/login" className="inline-block mt-5 text-[var(--color-orange)] font-bold text-sm no-underline hover:underline">
        &larr; Back to sign in
      </Link>
    </div>
  );
}
