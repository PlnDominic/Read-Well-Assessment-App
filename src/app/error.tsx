"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Most errors a user can hit offline are a change (save, add, start) that
// couldn't reach the server; say that plainly instead of "something broke".
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = useSyncExternalStore(subscribe, () => !navigator.onLine, () => false);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center px-4 pt-[14vh] text-center">
      <h1 className="font-heading font-bold text-[26px] text-[var(--color-sage-deep)] m-0 mb-2.5">
        {offline ? "You're offline" : "Something went wrong"}
      </h1>
      <p className="text-[var(--color-body)] text-base leading-relaxed m-0 mb-7 max-w-[440px]">
        {offline
          ? "That change needs an internet connection, so it wasn't saved. Reconnect and try again."
          : "Please try again. If it keeps happening, reload the page."}
      </p>
      <button
        onClick={() => reset()}
        className="bg-[var(--color-sage)] text-white border-none rounded-full font-bold text-base px-8 py-3 cursor-pointer"
      >
        Back to the page
      </button>
    </div>
  );
}
