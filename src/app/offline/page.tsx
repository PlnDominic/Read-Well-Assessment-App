import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SunnyMascot } from "@/components/icons";

export const dynamic = "force-static";

// Served by the service worker (public/sw.js) when a page that isn't
// available offline is opened without a connection.
export default function OfflinePage() {
  return (
    <AppShell showTopBar={false}>
      <div className="w-full max-w-[460px] mt-[8vh] text-center">
        <div className="relative flex justify-center mb-6">
          <div
            className="absolute inset-0 m-auto w-[170px] h-[170px] rounded-full blur-3xl opacity-70 pointer-events-none"
            style={{ background: "var(--color-sage-tint)" }}
            aria-hidden
          />
          <div className="relative w-24 h-24 rounded-full bg-[var(--color-sage)] flex items-center justify-center shadow-[0_10px_24px_rgba(74,107,82,0.25)]">
            <SunnyMascot size={56} mood="smile" />
          </div>
        </div>
        <h1 className="font-heading font-bold text-[32px] tracking-tight text-[var(--color-sage-deep)] m-0 mb-2.5">
          You&apos;re offline
        </h1>
        <p className="text-[var(--color-body)] text-base leading-relaxed m-0 mb-8">
          This page hasn&apos;t been opened on this device yet, so there&apos;s no saved copy to show. Pages you
          open while online are saved for offline use. Students who already started their assessment on this
          device can keep going with their code.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/student/join"
            className="bg-[var(--color-terracotta)] text-white rounded-full font-heading font-bold text-lg px-10 py-4 no-underline shadow-[0_10px_24px_rgba(201,123,95,0.35)] transition-transform hover:-translate-y-0.5"
          >
            I&apos;m a Student
          </Link>
          <Link href="/login" className="text-[var(--color-sage)] font-bold text-sm no-underline hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
