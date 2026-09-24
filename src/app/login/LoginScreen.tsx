"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SunnyAvatar } from "@/components/SunnyAvatar";
import { clearStaffOfflineData, savedStaffHome } from "@/lib/offline";
import { signInWithPassword } from "./actions";

type Mode = "select" | "teacher" | "administrator";

const ROLE_COPY: Record<Exclude<Mode, "select">, { title: string; subtitle: string; avatarSrc: string; tint: string }> = {
  teacher: {
    title: "Teacher Sign In",
    subtitle: "Start assessments and view your class's reports",
    avatarSrc: "/avatars/teacher.png",
    tint: "var(--color-terracotta-tint)",
  },
  administrator: {
    title: "Administrator Sign In",
    subtitle: "View the school-wide report",
    avatarSrc: "/avatars/admin.png",
    tint: "var(--color-taupe-bg)",
  },
};

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("select");
  const [offlineHome, setOfflineHome] = useState<string | null>(null);
  const router = useRouter();

  // Offline, this screen is the saved signed-out copy even for someone who
  // is still signed in, so offer the way back to their saved dashboard.
  useEffect(() => {
    if (navigator.onLine) return;
    savedStaffHome().then(setOfflineHome);
  }, []);

  if (mode !== "select") {
    return <StaffLoginForm mode={mode} onBack={() => setMode("select")} />;
  }

  return (
    <div className="w-full max-w-[480px] mt-[3vh] text-center">
      <div className="relative flex justify-center mb-4">
        <div
          className="absolute inset-0 m-auto w-[240px] h-[240px] rounded-full blur-3xl opacity-70 pointer-events-none"
          style={{ background: "var(--color-sage-tint)" }}
          aria-hidden
        />
        <SunnyAvatar size={176} />
      </div>
      <h1 className="font-heading font-bold text-5xl tracking-tight text-[var(--color-sage-deep)] m-0 mb-3">
        Read Well
      </h1>
      <span className="inline-block bg-[var(--color-sage-tint)] text-[var(--color-sage-dark)] text-sm font-bold px-4 py-1.5 rounded-full mb-9">
        Grade 1 Reading Assessment
      </span>

      {offlineHome && (
        <a
          href={offlineHome}
          className="block mb-6 bg-[var(--color-gold-bg)] border border-[var(--color-gold-border)] text-[var(--color-gold-text)] text-sm font-bold rounded-xl px-4 py-3 no-underline"
        >
          You&apos;re offline. Continue to your saved dashboard &rarr;
        </a>
      )}

      <div className="flex flex-col gap-4">
        <RoleTile
          avatarSrc="/avatars/student.png"
          tint="var(--color-sage-tint)"
          title="I'm a Student"
          subtitle="Take my reading assessment"
          onClick={() => router.push("/student/join")}
        />
        <RoleTile
          avatarSrc="/avatars/teacher.png"
          tint="var(--color-terracotta-tint)"
          title="I'm a Teacher"
          subtitle="Start assessments & view reports"
          onClick={() => setMode("teacher")}
        />
        <RoleTile
          avatarSrc="/avatars/admin.png"
          tint="var(--color-taupe-bg)"
          title="I'm an Administrator"
          subtitle="View the school-wide report"
          onClick={() => setMode("administrator")}
        />
      </div>
    </div>
  );
}

function RoleTile({
  avatarSrc,
  tint,
  title,
  subtitle,
  onClick,
}: {
  avatarSrc: string;
  tint: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{ backgroundImage: `linear-gradient(135deg, ${tint}, white)` }}
      className="group flex items-center gap-4 rounded-[28px] pl-5 pr-5 py-5 cursor-pointer text-left shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(0,0,0,0.12)]"
    >
      {/* Plain <img>, not next/image: see the comment in SunnyAvatar.tsx. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarSrc}
        alt=""
        width={128}
        height={128}
        className="w-32 h-32 rounded-full object-cover flex-shrink-0 shadow-[0_8px_20px_rgba(0,0,0,0.18)] ring-4 ring-white"
      />
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-[var(--color-sage-deep)] text-xl">{title}</div>
        <div className="text-[var(--color-muted)] text-sm mt-0.5">{subtitle}</div>
      </div>
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.1)] transition-transform group-hover:translate-x-1">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-[var(--color-sage-deep)]">
          <path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

const OFFLINE_SIGN_IN = "You're offline. Signing in needs an internet connection; reconnect and try again.";

// Signing in has to be checked by the server, so it can't work offline.
// Without this, the failed request would surface as an app error instead.
async function signInOrExplainOffline(prev: { error: string | null }, formData: FormData) {
  if (!navigator.onLine) return { error: OFFLINE_SIGN_IN };
  // Whoever signs in next shouldn't be able to open the previous staff
  // member's saved pages offline.
  await clearStaffOfflineData();
  try {
    return await signInWithPassword(prev, formData);
  } catch (err) {
    if (err instanceof TypeError || !navigator.onLine) return { error: OFFLINE_SIGN_IN };
    throw err;
  }
}

function StaffLoginForm({ mode, onBack }: { mode: Exclude<Mode, "select">; onBack: () => void }) {
  const [state, formAction, isPending] = useActionState(signInOrExplainOffline, { error: null });
  const copy = ROLE_COPY[mode];

  return (
    <div className="w-full max-w-[420px] mt-[4vh] text-center">
      <div className="relative flex justify-center mb-3">
        <div
          className="absolute inset-0 m-auto w-[160px] h-[160px] rounded-full blur-3xl opacity-70 pointer-events-none"
          style={{ background: copy.tint }}
          aria-hidden
        />
        {/* Plain <img>, not next/image: see the comment in SunnyAvatar.tsx. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={copy.avatarSrc}
          alt=""
          width={104}
          height={104}
          className="w-[104px] h-[104px] rounded-full object-cover shadow-[0_8px_20px_rgba(0,0,0,0.18)] ring-4 ring-white"
        />
      </div>

      <button
        onClick={onBack}
        className="bg-none border-none text-[var(--color-sage)] font-bold text-sm cursor-pointer p-0 mb-5"
      >
        &larr; Back
      </button>
      <div className="bg-white rounded-[28px] p-9 shadow-[0_10px_32px_rgba(0,0,0,0.08)] text-left">
        <h1 className="font-heading font-bold text-2xl text-[var(--color-sage-deep)] m-0 mb-1.5">{copy.title}</h1>
        <p className="text-[var(--color-body)] text-sm m-0 mb-7">{copy.subtitle}</p>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="role" value={mode} />
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wide">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="bg-[var(--color-neutral)] border-2 border-transparent rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-[var(--color-sage)] focus:bg-white transition-colors"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wide">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="bg-[var(--color-neutral)] border-2 border-transparent rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-[var(--color-sage)] focus:bg-white transition-colors"
            />
          </label>

          {state.error && <p className="text-[var(--color-terracotta-dark)] text-sm m-0">{state.error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 bg-[var(--color-sage)] text-white border-none rounded-full font-heading font-bold text-lg py-4 cursor-pointer shadow-[0_10px_24px_rgba(74,107,82,0.3)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {isPending ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <Link
          href="/login/forgot"
          className="block text-center mt-4 text-[var(--color-sage)] font-bold text-sm no-underline hover:underline"
        >
          Forgot your password?
        </Link>
      </div>
    </div>
  );
}
