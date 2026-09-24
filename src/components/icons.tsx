import { colors } from "@/lib/theme";

export function ReadWellMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="9" fill={colors.neutral} />
      <circle cx="7" cy="9" r="1.6" fill={colors.sageDark} />
      <circle cx="13" cy="9" r="1.6" fill={colors.sageDark} />
      <path
        d="M6 13 Q10 16 14 13"
        stroke={colors.sageDark}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "Sunny" the mascot, shown on the login and student-facing screens. */
export function SunnyMascot({ size = 56, mood = "smile" }: { size?: number; mood?: "smile" | "big-smile" }) {
  const mouth =
    mood === "big-smile"
      ? "M23 32 Q28 39 33 32"
      : "M25 33 Q28 37 31 33";
  return (
    <svg width={size} height={size} viewBox="0 0 56 56">
      <ellipse cx="18" cy="30" rx="7" ry="10" fill={colors.sageMid} />
      <ellipse cx="38" cy="30" rx="7" ry="10" fill={colors.sageMid} />
      <circle cx="28" cy="26" r="17" fill={colors.neutral} />
      <circle cx="21" cy="24" r="4.2" fill={colors.sageDeep} />
      <circle cx="35" cy="24" r="4.2" fill={colors.sageDeep} />
      <circle cx="22" cy="23" r="1.3" fill={colors.neutral} />
      <circle cx="36" cy="23" r="1.3" fill={colors.neutral} />
      <path d={mouth} stroke={colors.sageDeep} strokeWidth="2" fill="none" strokeLinecap="round" />
      <polygon points="25,29 31,29 28,33" fill={colors.terracotta} />
    </svg>
  );
}

export function CheckIcon({ size = 90, color = colors.white }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M5 13l4 4L19 7"
        stroke={color}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MicIcon({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={colors.white} />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={colors.white} strokeWidth="2" fill="none" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke={colors.white} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// "var(--color-sage-dark)" (not colors.sageDark) so these track the light/
// dark theme swap in globals.css -- fine for icons rendered in the browser,
// but see the comment on `colors` in lib/theme.ts for why PDF rendering
// can't do the same and has to keep using literal hex.
export function BellIcon({ size = 20, color = "var(--color-sage-dark)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M18 16v-5a6 6 0 0 0-12 0v5l-1.5 2.5h15L18 16Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 20.5a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SunIcon({ size = 20, color = "var(--color-sage-dark)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4.5" stroke={color} strokeWidth="1.8" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.2 12H2M22 12h-2.2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon({ size = 20, color = "var(--color-sage-dark)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
