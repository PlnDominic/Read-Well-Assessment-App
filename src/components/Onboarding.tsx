"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface OnboardingSlide {
  icon: ReactNode;
  title: string;
  body: string;
}

/**
 * A one-time, full-screen slideshow shown before someone's first sign-in or
 * first kiosk use on a device (localStorage[storageKey] tracks that it's
 * been seen). Skippable at any point. Renders nothing until after mount, so
 * the server-rendered page underneath never has to guess whether this
 * visitor has seen it -- avoiding a hydration mismatch -- and nothing shows
 * for a returning visitor who already has the flag set.
 */
export function Onboarding({ slides, storageKey }: { slides: OnboardingSlide[]; storageKey: string }) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const checkSeen = () => {
      // Private browsing / storage blocked: skip onboarding rather than
      // show it on every visit with no way to dismiss it permanently.
      let seen = true;
      try {
        seen = localStorage.getItem(storageKey) !== null;
      } catch {
        seen = true;
      }
      setShow(!seen);
    };
    checkSeen();
  }, [storageKey]);

  function finish() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Nothing to persist to; the slideshow just won't stay dismissed.
    }
    setShow(false);
  }

  if (!show) return null;

  const slide = slides[step];
  const isLast = step === slides.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Read Well"
      className="fixed inset-0 z-[90] flex flex-col bg-[var(--color-bg)] px-6 pt-6 pb-8"
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={finish}
          className="text-sm font-bold text-[var(--color-muted)] hover:text-[var(--color-ink)] px-3 py-2"
        >
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-[420px] mx-auto w-full">
        <div className="mb-6" aria-hidden>
          {slide.icon}
        </div>
        <h2 className="font-heading font-bold text-2xl tracking-tight text-[var(--color-ink)] m-0 mb-3">
          {slide.title}
        </h2>
        <p className="text-[var(--color-body)] text-base leading-relaxed m-0">{slide.body}</p>
      </div>

      <div className="flex items-center justify-center gap-2 mb-6" role="tablist" aria-label="Onboarding progress">
        {slides.map((s, i) => (
          <span
            key={s.title}
            role="tab"
            aria-selected={i === step}
            aria-label={`Slide ${i + 1} of ${slides.length}`}
            className="h-2 rounded-full transition-all"
            style={{
              width: i === step ? 20 : 8,
              background: i === step ? "var(--color-orange)" : "var(--color-neutral-border)",
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
        className="w-full max-w-[420px] mx-auto bg-[var(--color-orange)] text-white rounded-full font-heading font-bold text-lg py-4 shadow-[0_10px_24px_rgba(201,123,95,0.35)] transition-transform hover:-translate-y-0.5"
      >
        {isLast ? "Get Started" : "Next"}
      </button>
    </div>
  );
}
