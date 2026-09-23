"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SunnyMascot, StudentRoleIcon, TeacherRoleIcon, AdminRoleIcon } from "@/components/icons";
import { signInWithPassword } from "./actions";

type Mode = "select" | "teacher" | "administrator";

const ROLE_COPY: Record<Exclude<Mode, "select">, { title: string; subtitle: string }> = {
  teacher: { title: "Teacher Sign In", subtitle: "Start assessments and view your class's reports" },
  administrator: { title: "Administrator Sign In", subtitle: "View the school-wide report" },
};

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("select");
  const router = useRouter();

  if (mode !== "select") {
    return <StaffLoginForm mode={mode} onBack={() => setMode("select")} />;
  }

  return (
    <div className="w-full max-w-[460px] mt-[6vh] text-center">
      <div className="w-24 h-24 rounded-full bg-[var(--color-sage)] mx-auto mb-4.5 flex items-center justify-center shadow-[0_10px_24px_rgba(74,107,82,0.25)]">
        <SunnyMascot size={56} mood="smile" />
      </div>
      <h1 className="font-heading font-bold text-3xl text-[var(--color-sage-deep)] m-0 mb-1.5">Read Well</h1>
      <p className="text-[var(--color-body)] text-base m-0 mb-9">Grade 1 Reading Assessment</p>

      <div className="flex flex-col gap-3.5">
        <RoleTile
          icon={<StudentRoleIcon />}
          iconBg="var(--color-sage-tint)"
          title="I'm a Student"
          subtitle="Take my reading assessment"
          onClick={() => router.push("/student/join")}
        />
        <RoleTile
          icon={<TeacherRoleIcon />}
          iconBg="var(--color-terracotta-tint)"
          title="I'm a Teacher"
          subtitle="Start assessments & view reports"
          onClick={() => setMode("teacher")}
        />
        <RoleTile
          icon={<AdminRoleIcon />}
          iconBg="var(--color-taupe-bg)"
          title="I'm an Administrator"
          subtitle="View the school-wide report"
          onClick={() => setMode("administrator")}
        />
      </div>
    </div>
  );
}

function RoleTile({
  icon,
  iconBg,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3.5 bg-white border-2 border-[var(--color-cream-border)] rounded-[18px] px-5.5 py-4.5 cursor-pointer text-left hover:border-[var(--color-sage-tint-border)] transition-colors"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div>
        <div className="font-extrabold text-[var(--color-sage-deep)] text-[17px]">{title}</div>
        <div className="text-[var(--color-muted)] text-[13px]">{subtitle}</div>
      </div>
    </button>
  );
}

const OFFLINE_SIGN_IN = "You're offline. Signing in needs an internet connection; reconnect and try again.";

// Signing in has to be checked by the server, so it can't work offline.
// Without this, the failed request would surface as an app error instead.
async function signInOrExplainOffline(prev: { error: string | null }, formData: FormData) {
  if (!navigator.onLine) return { error: OFFLINE_SIGN_IN };
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
    <div className="w-full max-w-[420px] mt-[10vh]">
      <button
        onClick={onBack}
        className="bg-none border-none text-[var(--color-sage)] font-bold text-sm cursor-pointer p-0 mb-5"
      >
        &larr; Back
      </button>
      <div className="bg-white rounded-3xl p-9 shadow-[0_6px_20px_rgba(0,0,0,0.06)] border-2 border-[var(--color-cream-border)]">
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
              className="border-2 border-[var(--color-cream-border)] rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[var(--color-sage)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wide">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="border-2 border-[var(--color-cream-border)] rounded-xl px-4 py-3 text-base focus:outline-none focus:border-[var(--color-sage)]"
            />
          </label>

          {state.error && <p className="text-[var(--color-terracotta-dark)] text-sm m-0">{state.error}</p>}

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 bg-[var(--color-sage)] text-white border-none rounded-full font-heading font-bold text-lg py-3.5 cursor-pointer disabled:opacity-60"
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
