/**
 * The missions of the student game: one per ReadWell part, found from the
 * item-code prefix its game items use (LC01, VO01, ...). Shared by the game
 * (StudentAssessmentRunner.tsx) and the admin's game editor, so the editor
 * groups questions exactly as the child will meet them.
 */
export interface Part {
  code: string;
  number: number;
  title: string;
  subtitle: string;
  /** The ReadWell sitting: 1, 2, or 3 for the writing. */
  sitting: number;
  color: string;
}

// Each level's parts, in order, by the item-code prefix its game items use.
export const LEVEL_PARTS: Record<number, Part[]> = {
  1: [
    { code: "LC", number: 1, title: "Story listening", subtitle: "Listen to Sunny's story", sitting: 1, color: "#2563eb" },
    { code: "VO", number: 2, title: "Vocabulary", subtitle: "Find the picture", sitting: 1, color: "#2563eb" },
    { code: "CP", number: 3, title: "Print concepts", subtitle: "Show how books work", sitting: 1, color: "#2563eb" },
    { code: "SA", number: 4, title: "Sound awareness", subtitle: "Play with sounds", sitting: 1, color: "#7c3aed" },
    { code: "LN", number: 5, title: "Letter names", subtitle: "Find the letters", sitting: 1, color: "#0f766e" },
    { code: "LS", number: 6, title: "Letter sounds", subtitle: "Match sounds to letters", sitting: 1, color: "#0f766e" },
    { code: "CV", number: 7, title: "CV blending", subtitle: "Slide two sounds together", sitting: 2, color: "#ea580c" },
    { code: "RW", number: 8, title: "Real words", subtitle: "Read the little words", sitting: 2, color: "#ea580c" },
    { code: "NW", number: 9, title: "Made up words", subtitle: "Be a word inventor", sitting: 2, color: "#ea580c" },
    { code: "HW", number: 10, title: "Heart words", subtitle: "Words you know by heart", sitting: 2, color: "#db2777" },
    { code: "ST", number: 11, title: "Story reading", subtitle: "Read a story aloud", sitting: 2, color: "#db2777" },
    { code: "AT", number: 12, title: "Reading attitude", subtitle: "Tell Sunny how reading feels", sitting: 2, color: "#db2777" },
    { code: "WT", number: 13, title: "Writing", subtitle: "Show what you can write", sitting: 3, color: "#ca8a04" },
  ],
  2: [
    { code: "LS", number: 1, title: "Letter sounds", subtitle: "Find the sounds hiding in letters", sitting: 1, color: "#0f766e" },
    { code: "SV", number: 2, title: "Short vowel words", subtitle: "Read the little words", sitting: 1, color: "#0f766e" },
    { code: "LC", number: 3, title: "Story listening", subtitle: "Listen like a story detective", sitting: 1, color: "#2563eb" },
    { code: "VO", number: 4, title: "Vocabulary", subtitle: "Match words to pictures", sitting: 1, color: "#2563eb" },
    { code: "CP", number: 5, title: "Print concepts", subtitle: "Explore how stories work", sitting: 1, color: "#2563eb" },
    { code: "SA", number: 6, title: "Sound awareness", subtitle: "Climb the sound ladder", sitting: 1, color: "#7c3aed" },
    { code: "BL", number: 7, title: "Blend sounds", subtitle: "Slide sounds together", sitting: 2, color: "#ea580c" },
    { code: "RW", number: 8, title: "Real blend words", subtitle: "Read words with blends", sitting: 2, color: "#ea580c" },
    { code: "NW", number: 9, title: "Made-up words", subtitle: "Be a word inventor", sitting: 2, color: "#ea580c" },
    { code: "HW", number: 10, title: "Heart words", subtitle: "Words you know by heart", sitting: 2, color: "#db2777" },
    { code: "ST", number: 11, title: "Story reading", subtitle: "Read a story aloud", sitting: 2, color: "#db2777" },
    { code: "AT", number: 12, title: "Reading attitude", subtitle: "Tell us how reading feels", sitting: 2, color: "#db2777" },
    { code: "WT", number: 13, title: "Writing", subtitle: "Show what you can write", sitting: 3, color: "#ca8a04" },
  ],
};

/** Levels without their own list yet use Level 2's. */
export function partsFor(level: number | undefined): Part[] {
  return LEVEL_PARTS[level ?? 2] ?? LEVEL_PARTS[2];
}

/** The part an item belongs to, from its id's prefix; undefined if none matches. */
export function partFor(parts: readonly Part[], item?: { id: string }): Part | undefined {
  return parts.find((part) => item?.id.toUpperCase().startsWith(part.code));
}

/** A form whose items don't all carry part codes is split into missions of this many questions. */
export const MISSION_SIZE = 5;
