import { colors } from "@/lib/theme";

export function ReadWellMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="9" fill={colors.cream} />
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
      <circle cx="28" cy="26" r="17" fill={colors.cream} />
      <circle cx="21" cy="24" r="4.2" fill={colors.sageDeep} />
      <circle cx="35" cy="24" r="4.2" fill={colors.sageDeep} />
      <circle cx="22" cy="23" r="1.3" fill={colors.cream} />
      <circle cx="36" cy="23" r="1.3" fill={colors.cream} />
      <path d={mouth} stroke={colors.sageDeep} strokeWidth="2" fill="none" strokeLinecap="round" />
      <polygon points="25,29 31,29 28,33" fill={colors.terracotta} />
    </svg>
  );
}

export function StudentRoleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" fill={colors.sage} />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill={colors.sage} />
    </svg>
  );
}

export function TeacherRoleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <rect x="4" y="5" width="16" height="12" rx="2" fill={colors.terracotta} />
      <rect x="8" y="19" width="8" height="2" rx="1" fill={colors.terracotta} />
    </svg>
  );
}

export function AdminRoleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <rect x="3" y="12" width="4" height="9" fill={colors.taupe} />
      <rect x="10" y="7" width="4" height="14" fill={colors.taupe} />
      <rect x="17" y="3" width="4" height="18" fill={colors.taupe} />
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
