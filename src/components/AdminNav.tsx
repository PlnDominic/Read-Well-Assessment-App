"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/cycles", label: "Cycles" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="w-full max-w-[920px] flex gap-1 mb-6 flex-wrap bg-[var(--color-surface)] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.05)] p-1.5">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2 rounded-full text-sm font-bold no-underline transition-colors"
            style={{
              background: active ? "var(--color-orange)" : "transparent",
              color: active ? "white" : "var(--color-muted)",
              boxShadow: active ? "0 4px 10px rgba(74,107,82,0.3)" : "none",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
