"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SunnyAvatar } from "@/components/SunnyAvatar";
import { redeemSessionCode } from "./actions";

const OFFLINE_NEW_CODE =
  "This device is offline. Ask your teacher to reconnect it to the internet so you can use this code.";

// StudentAssessmentRunner records code -> session id each time an assessment
// loads on this device, so a code already used here can be reopened without
// a connection (the service worker serves the saved page).
function sessionIdForCodeOnThisDevice(code: string): string | null {
  try {
    return localStorage.getItem(`rw:code:${code}`);
  } catch {
    return null;
  }
}

async function redeemOnlineOrFromDevice(prev: { error: string | null }, formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const openSaved = () => {
    const sessionId = code ? sessionIdForCodeOnThisDevice(code) : null;
    if (!sessionId) return { error: OFFLINE_NEW_CODE };
    // A full page load on purpose: router.push would first fetch from the
    // server, which is exactly what can't happen here. The service worker
    // answers this navigation with the saved page instead.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/student/session/${sessionId}`);
    return { error: null };
  };

  if (!navigator.onLine) return openSaved();
  try {
    return await redeemSessionCode(prev, formData);
  } catch (err) {
    if (err instanceof TypeError || !navigator.onLine) return openSaved();
    throw err;
  }
}

export function JoinForm() {
  const [state, formAction, isPending] = useActionState(redeemOnlineOrFromDevice, { error: null });

  return (
    <div className="w-full max-w-[440px] mt-[5vh] text-center">
      <div className="relative flex justify-center mb-6">
        <div
          className="absolute inset-0 m-auto w-[190px] h-[190px] rounded-full blur-3xl opacity-70 pointer-events-none"
          style={{ background: "var(--color-sage-tint)" }}
          aria-hidden
        />
        <SunnyAvatar size={140} />
      </div>
      <h1 className="font-heading font-bold text-[32px] tracking-tight text-[var(--color-sage-deep)] m-0 mb-2.5">
        What&apos;s your code?
      </h1>
      <p className="text-[var(--color-body)] text-lg leading-relaxed m-0 mb-8">
        Ask your teacher for your code, then type it in below.
      </p>

      <form action={formAction} className="flex flex-col items-center gap-5">
        <input
          type="text"
          name="code"
          maxLength={6}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ABC123"
          className="w-full text-center tracking-[0.3em] uppercase font-heading font-bold text-3xl bg-[var(--color-cream)] border-2 border-transparent rounded-2xl py-5 focus:outline-none focus:border-[var(--color-sage)] focus:bg-white transition-colors"
        />

        {state.error && <p className="text-[var(--color-terracotta-dark)] text-base m-0">{state.error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="bg-[var(--color-terracotta)] text-white border-none rounded-full font-heading font-bold text-xl px-14 py-5 cursor-pointer shadow-[0_10px_24px_rgba(201,123,95,0.35)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {isPending ? "Checking…" : "Let's Go!"}
        </button>
      </form>

      <Link
        href="/login"
        className="inline-block mt-8 text-[var(--color-sage)] font-bold text-sm no-underline hover:underline"
      >
        &larr; Back
      </Link>
    </div>
  );
}
