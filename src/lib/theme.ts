// Brand palette is orange/black/white. The "sage"/"terracotta"/"gold" names
// are kept (renaming every call site across the PDF renderer and inline SVG
// icons was out of scope for the recolor), but every one now resolves to a
// shade of orange, black, or neutral gray -- see the matching comment in
// globals.css, which this file has to stay in sync with since PDF/SVG
// rendering can't read CSS custom properties. This always uses the light-
// mode values: a generated PDF is a printed page, not a themeable surface.
export const colors = {
  sage: "#EA580C",
  sageDark: "#C2410C",
  sageDeep: "#171717",
  sageMid: "#D9540B",
  sageTint: "#FCE7DA",
  sageTintBorder: "#F0BE97",

  terracotta: "#EA580C",
  terracottaDark: "#C2410C",
  terracottaTint: "#FCE7DA",

  neutral: "#F0F0F0",
  neutralBorder: "#DCDCDC",
  neutralBorderStrong: "#C9C9C9",
  neutralDivider: "#E6E6E6",

  ink: "#171717",
  inkSoft: "#2B2B2B",
  body: "#444444",
  muted: "#666666",
  mutedLight: "#666666",

  goldBg: "#FCE7DA",
  goldText: "#C2410C",
  goldBorder: "#F0BE97",

  taupe: "#6B6B6B",
  taupeBg: "#EDEDED",

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
  phonics: colors.sage,
  sightWords: colors.terracotta,
  fluency: colors.taupe,
  vocabulary: colors.sage,
  comprehension: colors.terracotta,
};
