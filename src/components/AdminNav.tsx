"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/cycles", label: "Cycles" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="w-full max-w-[920px] flex gap-2 mb-6 flex-wrap">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2 rounded-full text-sm font-bold no-underline"
            style={{
              background: active ? "var(--color-sage)" : "white",
              color: active ? "white" : "var(--color-sage-dark)",
              border: `1.5px solid ${active ? "var(--color-sage)" : "var(--color-cream-border)"}`,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
