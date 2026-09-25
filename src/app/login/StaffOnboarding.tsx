"use client";

import { Onboarding, type OnboardingSlide } from "@/components/Onboarding";

// The same photoreal avatar art used on the login/role-select screen
// (public/sunny.png, public/avatars/*.png), not the flat SVG mascot from
// components/icons.tsx -- keeps onboarding visually consistent with the
// screen it leads into.
function Avatar({ src }: { src: string }) {
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <div
        className="absolute inset-0 m-auto w-20 h-20 rounded-full blur-2xl opacity-70 pointer-events-none"
        style={{ background: "var(--color-orange-tint)" }}
      />
      {/* Plain <img>, not next/image: see the comment in SunnyAvatar.tsx. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={96} height={96} className="relative w-24 h-24 rounded-full object-cover shadow-[0_8px_20px_rgba(0,0,0,0.18)] ring-4 ring-white" />
    </div>
  );
}

const SLIDES: OnboardingSlide[] = [
  {
    icon: <Avatar src="/sunny.png" />,
    title: "Welcome to Read Well",
    body: "Quick, friendly reading checks for Grade 1 students, built for the classroom.",
  },
  {
    icon: <Avatar src="/avatars/student.png" />,
    title: "Assess in minutes",
    body: "Students read aloud into the mic and answer a few questions. Read Well scores fluency and skill areas automatically.",
  },
  {
    icon: <Avatar src="/avatars/teacher.png" />,
    title: "Track every student's growth",
    body: "See reports, flagged skill areas, and trends across cycles for your whole class or school at a glance.",
  },
  {
    icon: <Avatar src="/avatars/admin.png" />,
    title: "Works without Wi-Fi",
    body: "Your dashboard and in-progress assessments stay available offline, and sync automatically once you're back online.",
  },
];

export function StaffOnboarding() {
  return <Onboarding slides={SLIDES} storageKey="rw-onboarding-staff" />;
}
