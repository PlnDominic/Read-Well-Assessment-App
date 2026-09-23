import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SunnyMascot } from "@/components/icons";

export const dynamic = "force-static";

// Served by the service worker (public/sw.js) when a page that isn't
// available offline is opened without a connection.
export default function OfflinePage() {
  return (
    <AppShell showTopBar={false}>
      <div className="w-full max-w-[460px] mt-[10vh] text-center">
        <div className="w-24 h-24 rounded-full bg-[var(--color-sage)] mx-auto mb-5 flex items-center justify-center shadow-[0_10px_24px_rgba(74,107,82,0.25)]">
          <SunnyMascot size={56} mood="smile" />
        </div>
        <h1 className="font-heading font-bold text-[28px] text-[var(--color-sage-deep)] m-0 mb-2.5">
          You&apos;re offline
        </h1>
        <p className="text-[var(--color-body)] text-base leading-relaxed m-0 mb-8">
          This page needs an internet connection. Students who already started their assessment on this device
          can keep going with their code.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/student/join"
            className="bg-[var(--color-terracotta)] text-white rounded-full font-heading font-bold text-lg px-10 py-4 no-underline"
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
