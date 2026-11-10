import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell showTopBar={false}>
      <div className="w-full max-w-[460px] mt-[10vh] text-center">
        <h1 className="font-heading font-bold text-[32px] tracking-tight text-[var(--color-ink)] m-0 mb-2.5">Page not found</h1>
        <p className="text-[var(--color-body)] text-base leading-relaxed m-0 mb-8">
          That page doesn&apos;t exist, or you may not have access to it. Check the address, or go back to the start.
        </p>
        <Link
          href="/login"
          className="inline-block bg-[var(--color-orange)] text-[var(--color-on-orange)] rounded-full font-heading font-bold text-lg px-10 py-4 no-underline"
        >
          Back to the start
        </Link>
      </div>
    </AppShell>
  );
}
