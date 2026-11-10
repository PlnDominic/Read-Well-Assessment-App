import Link from "next/link";

/** Small privacy and terms links for the sign-in and code screens. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-[var(--color-muted)] ${className}`}>
      <Link href="/privacy" className="text-[var(--color-muted)] underline">Privacy</Link>
      {" · "}
      <Link href="/terms" className="text-[var(--color-muted)] underline">Terms</Link>
    </p>
  );
}
