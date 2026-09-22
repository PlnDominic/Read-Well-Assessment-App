export const colors = {
  sage: "#6B8F71",
  sageDark: "#4A6B52",
  sageDeep: "#2E3B2F",
  sageMid: "#5C7F62",
  sageTint: "#EAF1E8",
  sageTintBorder: "#B9CDBB",

  terracotta: "#C97B5F",
  // Originally #A85C3F — see globals.css for the contrast numbers behind
  // this and the other darkened tokens below; keep these two files in
  // sync since this one feeds PDF/inline-SVG rendering, which can't read
  // CSS custom properties.
  terracottaDark: "#9C5238",
  terracottaTint: "#FBF3EE",

  cream: "#F6F1E4",
  creamBorder: "#E3DAC0",
  creamBorderStrong: "#D9CFAF",
  creamDivider: "#EFEAD9",

  ink: "#2E3B2F",
  inkSoft: "#3A463B",
  body: "#5C6B5D",
  muted: "#5A6B5C",
  mutedLight: "#5A6B5C",

  goldBg: "#FBF0DE",
  goldText: "#7D5E28",
  goldBorder: "#E3D3A8",

  taupe: "#8B8365",
  taupeBg: "#EDEAE0",

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
