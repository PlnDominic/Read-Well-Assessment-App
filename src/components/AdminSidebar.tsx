"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ReadWellMark } from "@/components/icons";

type IconName = "home" | "students" | "staff" | "cycles" | "assessments" | "steps" | "skills" | "log" | "settings";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** True when this item is the current page. */
  isActive: (pathname: string) => boolean;
}

const is = (path: string) => (pathname: string) => pathname === path;
const under = (path: string) => (pathname: string) => pathname === path || pathname.startsWith(`${path}/`);

const MAIN: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "home", isActive: is("/admin") },
  { href: "/admin/students", label: "Students", icon: "students", isActive: under("/admin/students") },
  { href: "/admin/staff", label: "Staff", icon: "staff", isActive: under("/admin/staff") },
  { href: "/admin/cycles", label: "Cycles", icon: "cycles", isActive: under("/admin/cycles") },
];

const CONTENT: NavItem[] = [
  {
    href: "/admin/content",
    label: "Assessments",
    icon: "assessments",
    // The game editor lives under /admin/content/game, and belongs to Assessments.
    isActive: (p) => p === "/admin/content" || p.startsWith("/admin/content/game"),
  },
  { href: "/admin/content/recommendations", label: "Recommendations", icon: "steps", isActive: under("/admin/content/recommendations") },
  { href: "/admin/content/skills", label: "Skills and scoring", icon: "skills", isActive: under("/admin/content/skills") },
];

const OTHER: NavItem[] = [
  { href: "/admin/audit", label: "Activity log", icon: "log", isActive: under("/admin/audit") },
  { href: "/admin/settings", label: "Settings", icon: "settings", isActive: under("/admin/settings") },
];

const ICONS: Record<IconName, ReactNode> = {
  home: <path d="M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10" />,
  students: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.8.7 3 2.4 3 5.2" />
    </>
  ),
  staff: (
    <>
      <rect x="3.5" y="7" width="17" height="12.5" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" />
    </>
  ),
  cycles: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  assessments: (
    <>
      <path d="M6 3.5h9l3.5 3.5V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M9 12h6M9 15.5h6M9 8.5h3" />
    </>
  ),
  steps: (
    <>
      <path d="M9 5H7.5A1.5 1.5 0 0 0 6 6.5v13A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 5H15" />
      <path d="M9 4.5A.5.5 0 0 1 9.5 4h5a.5.5 0 0 1 .5.5V6H9V4.5ZM9.5 13l2 2 3.5-4" />
    </>
  ),
  skills: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  log: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {ICONS[name]}
    </svg>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.isActive(pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold no-underline transition-colors hover:bg-[var(--color-neutral)]"
      style={{
        background: active ? "var(--color-orange-tint)" : undefined,
        color: active ? "var(--color-orange-dark)" : "var(--color-ink-soft)",
      }}
    >
      <Icon name={item.icon} />
      {item.label}
    </Link>
  );
}

/**
 * The admin's navigation, down the left on a computer and behind a Menu
 * button on a phone. `footer` is the theme, notifications and log-out
 * controls, passed in because the notification bell is a server component.
 */
export function AdminSidebar({ avatarSrc, schoolName, footer }: { avatarSrc?: string; schoolName?: string; footer: ReactNode }) {
  const pathname = usePathname();
  // The page the menu was opened on: moving to another page closes it again.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Phone: a slim bar with the menu button. */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-[var(--color-surface)] border-b border-[var(--color-neutral-divider)] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full bg-[var(--color-orange)] flex items-center justify-center">
            <ReadWellMark size={18} />
          </span>
          <span className="font-heading font-bold text-lg text-[var(--color-ink)]">Read Well</span>
        </div>
        <button
          type="button"
          onClick={() => setOpenOn(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="admin-sidebar"
          className="bg-[var(--color-neutral)] border-none text-[var(--color-ink)] font-bold text-sm px-4 py-2 rounded-full cursor-pointer"
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>
      {open && <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setOpenOn(null)} aria-hidden="true" />}

      <aside
        id="admin-sidebar"
        aria-label="Admin"
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-[264px] shrink-0 flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-neutral-divider)] transition-transform md:translate-x-0 md:visible ${
          open ? "translate-x-0 visible" : "-translate-x-full invisible"
        }`}
      >
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <span className="w-10 h-10 rounded-full bg-[var(--color-orange)] flex items-center justify-center shrink-0">
            <ReadWellMark size={22} />
          </span>
          <div className="min-w-0">
            <div className="font-heading font-bold text-lg tracking-tight text-[var(--color-ink)] leading-tight">Read Well</div>
            {schoolName && <div className="text-xs text-[var(--color-muted)] truncate">{schoolName}</div>}
          </div>
        </div>

        <nav aria-label="Admin pages" className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-1">
          {MAIN.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
          <div className="mt-4 mb-1 px-3.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--color-muted)]">Content</div>
          {CONTENT.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
          <div className="mt-4 mb-1 px-3.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--color-muted)]">More</div>
          {OTHER.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
        </nav>

        <div className="border-t border-[var(--color-neutral-divider)] px-4 py-4 flex items-center gap-2.5 flex-wrap">
          {avatarSrc && (
            // Plain <img>, not next/image: see the comment in SunnyAvatar.tsx.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover ring-2 ring-[var(--color-neutral)]" />
          )}
          {footer}
        </div>
      </aside>
    </>
  );
}
