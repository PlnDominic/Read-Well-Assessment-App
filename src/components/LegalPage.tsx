import Link from "next/link";
import { AppShell } from "@/components/AppShell";

/** The organisation that runs the app, and who to write to, set per deployment. */
export const OPERATOR = process.env.NEXT_PUBLIC_OPERATOR_NAME || "Thrive EDU";
export const CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT || "your school's administrator";
export const LEGAL_UPDATED = "10 November 2026";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AppShell showTopBar={false}>
      <article className="w-full max-w-[720px] mt-[4vh] text-[var(--color-body)] leading-relaxed text-[15px]">
        <h1 className="font-heading font-bold text-[30px] tracking-tight text-[var(--color-ink)] m-0 mb-1">{title}</h1>
        <p className="text-sm text-[var(--color-muted)] m-0 mb-6">Last updated {LEGAL_UPDATED}</p>
        {children}
        <p className="mt-8 flex gap-5 text-sm font-bold">
          <Link href="/privacy" className="text-[var(--color-orange-dark)]">Privacy policy</Link>
          <Link href="/terms" className="text-[var(--color-orange-dark)]">Terms of use</Link>
          <Link href="/login" className="text-[var(--color-orange-dark)]">Back to sign in</Link>
        </p>
      </article>
    </AppShell>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading font-bold text-lg text-[var(--color-ink)] mt-7 mb-2">{children}</h2>;
}
