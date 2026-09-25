"use client";

import { Onboarding, type OnboardingSlide } from "@/components/Onboarding";
import { SunnyMascot } from "@/components/icons";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-20 h-20 rounded-full bg-[var(--color-orange-tint)] flex items-center justify-center">
      {children}
    </div>
  );
}

const SLIDES: OnboardingSlide[] = [
  {
    icon: (
      <Icon>
        <SunnyMascot size={44} mood="big-smile" />
      </Icon>
    ),
    title: "Welcome to Read Well",
    body: "Quick, friendly reading checks for Grade 1 students, built for the classroom.",
  },
  {
    icon: (
      <Icon>
        <SunnyMascot size={44} mood="smile" />
      </Icon>
    ),
    title: "Assess in minutes",
    body: "Students read aloud into the mic and answer a few questions. Read Well scores fluency and skill areas automatically.",
  },
  {
    icon: (
      <Icon>
        <SunnyMascot size={44} mood="big-smile" />
      </Icon>
    ),
    title: "Track every student's growth",
    body: "See reports, flagged skill areas, and trends across cycles for your whole class or school at a glance.",
  },
  {
    icon: (
      <Icon>
        <SunnyMascot size={44} mood="smile" />
      </Icon>
    ),
    title: "Works without Wi-Fi",
    body: "Your dashboard and in-progress assessments stay available offline, and sync automatically once you're back online.",
  },
];

export function StaffOnboarding() {
  return <Onboarding slides={SLIDES} storageKey="rw-onboarding-staff" />;
}
