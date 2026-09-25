// Brand palette is orange/black/white -- see the matching comment in
// globals.css, which this file has to stay in sync with since PDF/inline-
// SVG rendering can't read CSS custom properties. This always uses the
// light-mode values: a generated PDF is a printed page, not a themeable
// surface.
export const colors = {
  orange: "#EA580C",
  // ~4.9:1 against white -- see the muted/body comments below for the same
  // "just past AA" contrast-tuning approach applied throughout this file.
  orangeDark: "#C2410C",
  orangeMid: "#D9540B",
  orangeTint: "#FCE7DA",
  orangeTintBorder: "#F0BE97",

  neutral: "#F0F0F0",
  neutralBorder: "#DCDCDC",
  neutralBorderStrong: "#C9C9C9",
  neutralDivider: "#E6E6E6",

  ink: "#171717",
  inkSoft: "#2B2B2B",
  body: "#444444",
  muted: "#666666",
  mutedLight: "#666666",

  white: "#FFFFFF",
} as const;

/** Score threshold below which a skill area is flagged as a difficulty area. */
export const FLAGGED_SCORE_THRESHOLD = 65;

export const SKILL_AREA_ORDER = [
  "phonics",
  "sightWords",
  "fluency",
  "vocabulary",
  "comprehension",
] as const;

export type SkillAreaKey = (typeof SKILL_AREA_ORDER)[number];

export const SKILL_AREA_LABELS: Record<SkillAreaKey, string> = {
  phonics: "Phonemic Awareness / Phonics",
  sightWords: "Sight Word Recognition",
  fluency: "Fluency",
  vocabulary: "Vocabulary",
  comprehension: "Comprehension",
};

export const SKILL_AREA_TILE_COLOR: Record<SkillAreaKey, string> = {
  phonics: colors.orange,
  sightWords: colors.orange,
  fluency: colors.muted,
  vocabulary: colors.orange,
  comprehension: colors.orange,
};
