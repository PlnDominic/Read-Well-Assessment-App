"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase redirects back here with #error=...&error_description=...
    // in the URL hash when the recovery link is invalid or expired.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const description = hash.get("error_description");
    // Reading a browser-only API (the URL hash Supabase's redirect sets) on
    // mount, not a value derivable during render, so an effect is correct
    // here despite the lint rule's default suspicion of setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (description) setLinkError(description.replace(/\+/g, " "));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setFormError("Passwords don't match.");
      return;
    }

    setIsPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setIsPending(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (linkError) {
    return (
      <div className="w-full max-w-[420px] mt-[10vh] text-center">
        <h1 className="font-heading font-bold text-2xl text-[var(--color-ink)] m-0 mb-3">Link expired</h1>
        <p className="text-[var(--color-orange-dark)] text-sm mb-6">{linkError}</p>
        <a href="/login/forgot" className="text-[var(--color-orange)] font-bold text-sm no-underline hover:underline">
          Request a new link
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full max-w-[420px] mt-[10vh] text-center">
        <h1 className="font-heading font-bold text-2xl text-[var(--color-ink)] m-0 mb-3">Password updated</h1>
        <p className="text-[var(--color-body)] text-sm">Taking you back to sign in…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[420px] mt-[10vh]">
      <h1 className="font-heading font-bold text-2xl text-[var(--color-ink)] m-0 mb-1.5">Set a new password</h1>
      <p className="text-[var(--color-body)] text-sm m-0 mb-6">At least 8 characters.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="password"
          name="password"
          required
          minLength={8}
          placeholder="New password"
          autoComplete="new-password"
          className="border-2 border-[var(--color-neutral-border)] rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[var(--color-orange)]"
        />
        <input
          type="password"
          name="confirm"
          required
          minLength={8}
          placeholder="Confirm new password"
          autoComplete="new-password"
          className="border-2 border-[var(--color-neutral-border)] rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[var(--color-orange)]"
        />
        {formError && <p className="text-[var(--color-orange-dark)] text-sm m-0">{formError}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="bg-[var(--color-orange)] text-white border-none rounded-full font-heading font-bold text-lg py-3.5 cursor-pointer disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}
