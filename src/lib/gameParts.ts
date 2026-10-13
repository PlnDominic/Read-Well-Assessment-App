/**
 * The parts of the student game: one per ReadWell part, found from the
 * item-code prefix its game items use (LC01, VO01, ...). Shared by the game
 * (StudentAssessmentRunner.tsx) and the admin's game editor, so the editor
 * groups questions exactly as the child will meet them.
 *
 * The child doesn't meet thirteen missions: a ReadWell sitting's parts are
 * paired up (`mission`), so a level plays as seven short missions, each of
 * about ten questions, and the map has seven stops instead of thirteen.
 */

/** A mission is one or two neighbouring parts of the same sitting, so the map has fewer stops. */
export interface MissionInfo {
  key: string;
  title: string;
  subtitle: string;
}

export interface Part {
  code: string;
  number: number;
  title: string;
  subtitle: string;
  /** The ReadWell sitting: 1, 2, or 3 for the writing. */
  sitting: number;
  color: string;
  /** The mission this part belongs to; neighbouring parts with the same key play as one mission. */
  mission: MissionInfo;
}

// Each level's parts, in order, by the item-code prefix its game items use.
export const LEVEL_PARTS: Record<number, Part[]> = {
  1: [
    { code: "LC", number: 1, title: "Story listening", subtitle: "Listen to Sunny's story", sitting: 1, color: "#2563eb", mission: { key: "listen", title: "Listen and look", subtitle: "Stories and pictures" } },
    { code: "VO", number: 2, title: "Vocabulary", subtitle: "Find the picture", sitting: 1, color: "#2563eb", mission: { key: "listen", title: "Listen and look", subtitle: "Stories and pictures" } },
    { code: "CP", number: 3, title: "Print concepts", subtitle: "Show how books work", sitting: 1, color: "#2563eb", mission: { key: "books", title: "Books and sounds", subtitle: "How books work, and playing with sounds" } },
    { code: "SA", number: 4, title: "Sound awareness", subtitle: "Play with sounds", sitting: 1, color: "#7c3aed", mission: { key: "books", title: "Books and sounds", subtitle: "How books work, and playing with sounds" } },
    { code: "LN", number: 5, title: "Letter names", subtitle: "Find the letters", sitting: 1, color: "#0f766e", mission: { key: "letters", title: "Letters and sounds", subtitle: "Find the letters and match their sounds" } },
    { code: "LS", number: 6, title: "Letter sounds", subtitle: "Match sounds to letters", sitting: 1, color: "#0f766e", mission: { key: "letters", title: "Letters and sounds", subtitle: "Find the letters and match their sounds" } },
    { code: "CV", number: 7, title: "CV blending", subtitle: "Slide two sounds together", sitting: 2, color: "#c2410c", mission: { key: "little", title: "Little words", subtitle: "Slide sounds and read short words" } },
    { code: "RW", number: 8, title: "Real words", subtitle: "Read the little words", sitting: 2, color: "#c2410c", mission: { key: "little", title: "Little words", subtitle: "Slide sounds and read short words" } },
    { code: "NW", number: 9, title: "Made up words", subtitle: "Be a word inventor", sitting: 2, color: "#c2410c", mission: { key: "known", title: "Words you know", subtitle: "Made up words and words you know by heart" } },
    { code: "HW", number: 10, title: "Heart words", subtitle: "Words you know by heart", sitting: 2, color: "#be185d", mission: { key: "known", title: "Words you know", subtitle: "Made up words and words you know by heart" } },
    { code: "ST", number: 11, title: "Story reading", subtitle: "Read a story aloud", sitting: 2, color: "#be185d", mission: { key: "story", title: "Story time", subtitle: "Read a story and tell how reading feels" } },
    { code: "AT", number: 12, title: "Reading attitude", subtitle: "Tell Sunny how reading feels", sitting: 2, color: "#be185d", mission: { key: "story", title: "Story time", subtitle: "Read a story and tell how reading feels" } },
    { code: "WT", number: 13, title: "Writing", subtitle: "Show what you can write", sitting: 3, color: "#a16207", mission: { key: "write", title: "Writing", subtitle: "Show what you can write" } },
  ],
  2: [
    { code: "LS", number: 1, title: "Letter sounds", subtitle: "Find the sounds hiding in letters", sitting: 1, color: "#0f766e", mission: { key: "letters", title: "Letters and little words", subtitle: "Find the sounds, then read little words" } },
    { code: "SV", number: 2, title: "Short vowel words", subtitle: "Read the little words", sitting: 1, color: "#0f766e", mission: { key: "letters", title: "Letters and little words", subtitle: "Find the sounds, then read little words" } },
    { code: "LC", number: 3, title: "Story listening", subtitle: "Listen like a story detective", sitting: 1, color: "#2563eb", mission: { key: "listen", title: "Listen and look", subtitle: "Stories and pictures" } },
    { code: "VO", number: 4, title: "Vocabulary", subtitle: "Match words to pictures", sitting: 1, color: "#2563eb", mission: { key: "listen", title: "Listen and look", subtitle: "Stories and pictures" } },
    { code: "CP", number: 5, title: "Print concepts", subtitle: "Explore how stories work", sitting: 1, color: "#2563eb", mission: { key: "books", title: "Books and sounds", subtitle: "How stories work, and climbing the sound ladder" } },
    { code: "SA", number: 6, title: "Sound awareness", subtitle: "Climb the sound ladder", sitting: 1, color: "#7c3aed", mission: { key: "books", title: "Books and sounds", subtitle: "How stories work, and climbing the sound ladder" } },
    { code: "BL", number: 7, title: "Blend sounds", subtitle: "Slide sounds together", sitting: 2, color: "#c2410c", mission: { key: "blend", title: "Blend and read", subtitle: "Slide sounds together and read blend words" } },
    { code: "RW", number: 8, title: "Real blend words", subtitle: "Read words with blends", sitting: 2, color: "#c2410c", mission: { key: "blend", title: "Blend and read", subtitle: "Slide sounds together and read blend words" } },
    { code: "NW", number: 9, title: "Made-up words", subtitle: "Be a word inventor", sitting: 2, color: "#c2410c", mission: { key: "known", title: "Words you know", subtitle: "Made up words and words you know by heart" } },
    { code: "HW", number: 10, title: "Heart words", subtitle: "Words you know by heart", sitting: 2, color: "#be185d", mission: { key: "known", title: "Words you know", subtitle: "Made up words and words you know by heart" } },
    { code: "ST", number: 11, title: "Story reading", subtitle: "Read a story aloud", sitting: 2, color: "#be185d", mission: { key: "story", title: "Story time", subtitle: "Read a story and tell how reading feels" } },
    { code: "AT", number: 12, title: "Reading attitude", subtitle: "Tell us how reading feels", sitting: 2, color: "#be185d", mission: { key: "story", title: "Story time", subtitle: "Read a story and tell how reading feels" } },
    { code: "WT", number: 13, title: "Writing", subtitle: "Show what you can write", sitting: 3, color: "#a16207", mission: { key: "write", title: "Writing", subtitle: "Show what you can write" } },
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
