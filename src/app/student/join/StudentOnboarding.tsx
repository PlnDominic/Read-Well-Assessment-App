"use client";

import { Onboarding, type OnboardingSlide } from "@/components/Onboarding";
import { SunnyMascot, MicIcon } from "@/components/icons";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-20 h-20 rounded-full bg-[var(--color-orange)] flex items-center justify-center">
      {children}
    </div>
  );
}

const SLIDES: OnboardingSlide[] = [
  {
    icon: (
      <div className="w-20 h-20 rounded-full bg-[var(--color-orange-tint)] flex items-center justify-center">
        <SunnyMascot size={44} mood="big-smile" />
      </div>
    ),
    title: "Hi! I'm Sunny",
    body: "I'll help you with your reading check today. It only takes a few minutes!",
  },
  {
    icon: (
      <Icon>
        <MicIcon size={36} />
      </Icon>
    ),
    title: "Read out loud",
    body: "When you see a story, read it out loud into the microphone. Just do your best!",
  },
  {
    icon: (
      <div className="w-20 h-20 rounded-full bg-[var(--color-orange-tint)] flex items-center justify-center">
        <SunnyMascot size={44} mood="smile" />
      </div>
    ),
    title: "Ready when you are",
    body: "Ask your teacher for your code, then type it in to get started.",
  },
];

export function StudentOnboarding() {
  return <Onboarding slides={SLIDES} storageKey="rw-onboarding-student" />;
}
