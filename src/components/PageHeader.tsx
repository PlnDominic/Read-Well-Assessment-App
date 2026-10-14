/**
 * The top of an admin page: a title, one short line saying what the page is
 * for, and the page's main buttons on the right.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start flex-wrap gap-3.5 mb-6">
      <div className="min-w-0">
        <h1 className="font-heading font-bold text-[28px] tracking-tight text-[var(--color-ink)] m-0">{title}</h1>
        {subtitle && <p className="text-[var(--color-muted)] text-[15px] leading-snug m-0 mt-1 max-w-[560px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
    </div>
  );
}

/** A white card, the same on every admin page. */
export function Card({ title, hint, children, className = "" }: { title?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-[var(--color-surface)] rounded-[24px] shadow-[0_8px_24px_rgba(0,0,0,0.07)] px-6 py-6 sm:px-8 mb-5 ${className}`}>
      {title && <h2 className="font-heading font-bold text-base text-[var(--color-ink)] m-0">{title}</h2>}
      {hint && <p className="text-[var(--color-muted)] text-sm leading-snug m-0 mt-1 mb-4">{hint}</p>}
      {title && !hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

/** A button-shaped link or button for the page header, in the quiet style. */
export const quietButton =
  "bg-[var(--color-neutral)] border-none text-[var(--color-orange-dark)] font-bold text-sm px-4.5 py-2.5 rounded-full no-underline cursor-pointer transition-colors hover:bg-[var(--color-neutral-divider)]";
export const mainButton =
  "bg-[var(--color-orange)] text-[var(--color-on-orange)] border-none rounded-full font-bold text-sm px-5 py-2.75 cursor-pointer no-underline";
