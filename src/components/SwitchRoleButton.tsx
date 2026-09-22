"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SwitchRoleButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        })
      }
      className="bg-white border-[1.5px] border-[var(--color-cream-border-strong)] text-[var(--color-sage-dark)] font-bold text-sm px-4 py-2.25 rounded-full cursor-pointer disabled:opacity-60"
    >
      Switch Role
    </button>
  );
}
