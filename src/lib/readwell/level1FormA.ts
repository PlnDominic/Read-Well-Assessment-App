import type { AssessmentItem } from "@/lib/database.types";
import { KG1 } from "@/lib/grades";
import type { FormDef, PartDef, StrandDef, StrandKey } from "./form";

/**
 * ReadWell Level 1 Baseline Assessment: Assessor Guide, Form A, for KG 1.
 *
 * "Paper is the master": the wording below is the guide's, word for word.
 * Change the guide first, then this file, then supabase/setup.sql and the
 * migration that seed it (src/lib/readwell/seedSql.test.ts fails until
 * they match). Item codes never change once a form is in use; a result
 * from paper and a result from a tablet share them.
 *
 * Part 4 (sound awareness) is scripted in a separate document, the
 * ReadWell Level 1 Sound Awareness Subtest: Form A. Only its 45 item
 * codes are here; the assessor reads the ladder from that script.
 */

const FORM = "L1A";

function code(strand: string, n: number | string): string {
  return typeof n === "number" ? `${FORM}.${strand}.${String(n).padStart(2, "0")}` : `${FORM}.${strand}.${n}`;
}

// --- Part data, transcribed from the guide -----------------------------------

const STORY_LISTENING_TEXT =
  "Kwaku has a little brown goat. Every morning he gives the goat water. One day the gate was open, and the goat ran away. Kwaku looked behind the house. He looked under the mango tree. Then he heard a sound from the kitchen. The goat was eating the yam! Kwaku laughed and tied the goat with a rope.";

const LC: [string, string][] = [
  ["What animal does Kwaku have?", "A goat"],
  ["What does Kwaku give the goat every morning?", "Water"],
  ["Where did Kwaku find the goat?", "In the kitchen"],
  ["Why was the goat able to run away?", "The gate was open"],
  ["Why do you think Kwaku tied the goat with a rope?", "So it cannot run away again, or any sensible reason"],
];

// word, pictures left to right, correct position
const VO: [string, string, number][] = [
  ["ram", "hen, ram, dog, fish", 2],
  ["web", "net, rope, web, nest", 3],
  ["hut", "hut, tent, car, tree", 1],
  ["mop", "broom, brush, bucket, mop", 4],
  ["tin", "cup, tin, bottle, basket", 2],
  ["bucket", "pot, bowl, basket, bucket", 4],
  ["ladder", "ladder, chair, table, door", 1],
  ["bridge", "road, river, bridge, gate", 3],
  ["roof", "window, roof, door, wall", 2],
  ["farmer", "teacher, driver, farmer, doctor", 3],
];

const CP: [string, string][] = [
  ["Show me the front of this book.", "Turns to or points to the front cover"],
  ["Show me the back of the book.", "Points to the back cover"],
  ["Open the book so that we can read it.", "Opens from the front with the book the right way up"],
  ["I want to read this page. Show me where I start reading.", "Points to the first word of the first line, not the picture"],
  ["Which way do I go from there?", "Moves a finger from left to right along the line"],
  ["Where do I go after that?", "Moves down to the start of the next line"],
  ["Show me just one letter.", "Points to or covers one letter only"],
  ["Show me just one word.", "Points to or frames one whole word"],
  ["Show me a capital letter.", "Points to any capital letter"],
  ["Show me a full stop.", "Points to any full stop"],
];

const LN_ROWS = ["s m a t o b", "k e w d r i", "n z c f u h", "p x g l j y", "v q"];
const LS_ROWS = ["a t s m p n", "g i h d u c", "f o l y b r", "e k w j z v", "x q"];
const CV_ROWS = ["ma fe ti po su", "da ne li bo gu"];
const RW_ROWS = ["gap den rip jog bug", "yes dim lap hum fog", "rib lot wag met bud", "pop tug bet hip bad"];
const NW_ROWS = ["vap teg nim dob fum", "zat pib vog lut fep"];
// word, heart word set
const HW_ROWS: [string, number][][] = [
  [["the", 1], ["of", 1], ["she", 2], ["have", 2], ["are", 3]],
  [["go", 3], ["with", 4], ["he", 4], ["was", 5], ["you", 5]],
  [["said", 6], ["there", 6], ["look", 7], ["like", 7], ["down", 8]],
  [["for", 8], ["saw", 9], ["away", 9], ["happy", 10], ["where", 10]],
];

const LETTER_SOUND_ACCEPT: { letter: string; accept: string }[] = [
  { letter: "a, e, i, o, u", accept: "The short sound only, as in apple, egg, igloo, orange, umbrella" },
  { letter: "c and k", accept: "/k/" },
  { letter: "g", accept: "/g/ as in goat" },
  { letter: "q", accept: "/kw/" },
  { letter: "x", accept: "/ks/ as at the end of fox" },
  { letter: "y", accept: "/y/ as in yam" },
  { letter: "All others", accept: 'The usual sound. A small extra vowel, such as "buh" for /b/, is still correct' },
];

function letterSoundAccept(letter: string): string {
  if ("aeiou".includes(letter)) return "The short sound only";
  if (letter === "c" || letter === "k") return "/k/";
  if (letter === "g") return "/g/ as in goat";
  if (letter === "q") return "/kw/";
  if (letter === "x") return "/ks/ as at the end of fox";
  if (letter === "y") return "/y/ as in yam";
  return `/${letter}/ (a small extra vowel is still correct)`;
}

const STORY_TITLE = "Tim and the pup";
const STORY_LINES = [
  "Tim has a big red bag.",
  "A pup hid in the bag.",
  "Tim said no to the pup.",
  "The pup did not go.",
  "It sat on his leg.",
  "Tim and the pup sat in the sun.",
  "Now Tim is happy.",
];

// ask, accept, from line
const STQ: [string, string, number][] = [
  ["What does Tim have?", "A bag, or a big red bag", 1],
  ["Where did the pup hide?", "In the bag", 2],
  ["What did Tim say to the pup?", "No", 3],
  ["Where did the pup sit?", "On his leg, or on Tim's leg", 5],
  ["Why do you think Tim is happy at the end?", "He likes the pup, he has a friend, or any sensible reason from the story", 7],
];

const FACES = [
  { label: "Happy", value: 3 },
  { label: "Just okay", value: 2 },
  { label: "Sad", value: 1 },
];
const AT: [string, typeof FACES | { label: string; value: string }[]][] = [
  ["How do you feel when someone reads a story to you?", FACES],
  ["How do you feel when you look at books by yourself?", FACES],
  ["How do you feel about learning to read?", FACES],
  [
    "Does someone at home read or tell stories with you?",
    [
      { label: "Yes", value: "yes" },
      { label: "Sometimes", value: "sometimes" },
      { label: "No", value: "no" },
    ],
  ],
];

// --- Items ---------------------------------------------------------------------

function gridItems(strand: string, part: number, skill: StrandKey, rows: string[], accept?: (s: string) => string): AssessmentItem[] {
  const items: AssessmentItem[] = [];
  let n = 0;
  rows.forEach((row, r) => {
    for (const stimulus of row.split(" ")) {
      n += 1;
      items.push({
        id: code(strand, n),
        skillAreaKey: skill,
        type: "assessor",
        part,
        row: r + 1,
        prompt: stimulus,
        ...(accept ? { accept: accept(stimulus) } : {}),
      });
    }
  });
  return items;
}

function buildItems(): AssessmentItem[] {
  const items: AssessmentItem[] = [];

  LC.forEach(([ask, accept], i) =>
    items.push({ id: code("LC", i + 1), skillAreaKey: "storyListening", type: "assessor", part: 1, prompt: ask, accept })
  );

  VO.forEach(([word, pictures, position], i) =>
    items.push({
      id: code("VO", i + 1),
      skillAreaKey: "vocabulary",
      type: "assessor",
      part: 2,
      prompt: word,
      detail: pictures,
      accept: `Picture ${position} (${word})`,
    })
  );

  CP.forEach(([say, accept], i) =>
    items.push({
      id: code("CP", i + 1),
      skillAreaKey: "printConcepts",
      type: "assessor",
      part: 3,
      prompt: say,
      accept,
      ...(i === 3 ? { instruction: "Now turn to page 4 yourself." } : {}),
    })
  );

  for (let rung = 1; rung <= 9; rung++) {
    for (let n = 1; n <= 5; n++) {
      items.push({
        id: code("SA", `${rung}.${n}`),
        skillAreaKey: "soundAwareness",
        type: "assessor",
        part: 4,
        row: rung,
        prompt: `Rung ${rung}, item ${n}`,
      });
    }
  }

  items.push(...gridItems("LN", 5, "letterNames", LN_ROWS));
  items.push(...gridItems("LS", 6, "letterSounds", LS_ROWS, letterSoundAccept));
  items.push(...gridItems("CV", 7, "wordReading", CV_ROWS));
  items.push(...gridItems("RW", 8, "wordReading", RW_ROWS));
  items.push(...gridItems("NW", 9, "wordReading", NW_ROWS));

  HW_ROWS.forEach((row, r) =>
    row.forEach(([word, set], i) =>
      items.push({
        id: code("HW", r * 5 + i + 1),
        skillAreaKey: "heartWords",
        type: "assessor",
        part: 10,
        row: r + 1,
        prompt: word,
        detail: `Set ${set}`,
      })
    )
  );

  items.push({
    id: `${FORM}.ST.READ`,
    skillAreaKey: "storyQuestions",
    type: "assessor",
    part: 11,
    prompt: STORY_TITLE,
    scored: false,
  });
  STQ.forEach(([ask, accept, fromLine], i) =>
    items.push({
      id: code("STQ", i + 1),
      skillAreaKey: "storyQuestions",
      type: "assessor",
      part: 11,
      prompt: ask,
      accept,
      fromLine,
    })
  );

  AT.forEach(([ask, choices], i) =>
    items.push({
      id: code("AT", i + 1),
      skillAreaKey: "readingAttitude",
      type: "assessor",
      part: 12,
      prompt: ask,
      scored: false,
      responseChoices: choices,
    })
  );

  items.push({
    id: code("WT", 1),
    skillAreaKey: "writing",
    type: "assessor",
    part: 13,
    row: 1,
    prompt: "Write your name on the first line.",
    maxScore: 2,
    accept: "2: The whole first name, readable. 1: The first letter, or at least two letters of the name. 0: Nothing, or marks that are not letters.",
  });
  (
    [
      ["/s/", "s"],
      ["/m/", "m"],
      ["/t/", "t"],
      ["/b/", "b"],
      ["/i/", "i"],
    ] as const
  ).forEach(([say, correct], i) =>
    items.push({ id: code("WT", i + 2), skillAreaKey: "writing", type: "assessor", part: 13, row: 2, prompt: say, accept: correct })
  );
  (
    [
      ["tag", "The shirt has a tag."],
      ["peg", "Hang the cloth with a peg."],
      ["job", "My mother has a job."],
      ["bun", "I ate a bun."],
    ] as const
  ).forEach(([word, sentence], i) =>
    items.push({
      id: code("WT", i + 7),
      skillAreaKey: "writing",
      type: "assessor",
      part: 13,
      row: 3,
      prompt: word,
      detail: sentence,
      accept: "All three letters are correct and in the right order",
    })
  );
  [
    "The sentence starts with a capital letter",
    "There are clear spaces between the words",
    "The sentence ends with a full stop",
    "At least three of the five words are spelled correctly",
  ].forEach((rule, i) =>
    items.push({ id: code("WT", i + 11), skillAreaKey: "writing", type: "assessor", part: 13, row: 4, prompt: rule })
  );

  return items;
}

// --- Parts -----------------------------------------------------------------------

const READING_WORDS_NOTE =
  "The child reads across each row from left to right. Sounding out and then saying the whole word is correct. Saying only the separate sounds, without the whole word, scores 0.";

const PARTS: PartDef[] = [
  {
    number: 1,
    code: "LC",
    title: "Story listening",
    kind: "questions",
    strand: "storyListening",
    stimulus: "None",
    script: [
      { say: "I am going to read you a short story. Listen carefully. Then I will ask you some questions." },
      { do: "Read the story once, clearly and at a natural pace. Do not show any text or picture." },
      { say: STORY_LISTENING_TEXT },
    ],
    notes: ["The child may answer in any language. Score the meaning, not the grammar."],
  },
  {
    number: 2,
    code: "VO",
    title: "Vocabulary",
    kind: "vocabulary",
    strand: "vocabulary",
    stimulus: "Pages 2 and 3",
    script: [
      { do: "Open the stimulus book at page 2." },
      { say: "Look at these pictures. I will say a word. You point to the picture. Point to the ball." },
      { do: "If the child is wrong on the practice row, point and say:" },
      { say: "This is the ball." },
    ],
    practice: "ball (pictures: ball, cup, shoe, book; correct position 1)",
    notes: [
      'Say only the bold line "Point to the …" for each item. Do not name the other pictures.',
      "Items 1 to 5 are words the Level 1 book teaches. Items 6 to 10 are everyday words it does not teach.",
    ],
  },
  {
    number: 3,
    code: "CP",
    title: "Print concepts",
    kind: "questions",
    strand: "printConcepts",
    stimulus: "Cover and page 4",
    script: [{ do: "Close the stimulus book. Hand it to the child upside down, with the back cover facing up." }],
    notes: [],
  },
  {
    number: 4,
    code: "SA",
    title: "Sound awareness",
    kind: "ladder",
    strand: "soundAwareness",
    stimulus: "Page 5 (rhyme only)",
    script: [
      {
        do: "Give the nine rung sound ladder exactly as written in the ReadWell Level 1 Sound Awareness Subtest: Form A. The rhyme pictures for Rung 3 are on page 5 of the stimulus book.",
      },
    ],
    notes: ["Item codes run from SA1.1 (Rung 1, item 1) to SA9.5 (Rung 9, item 5). Apply the subtest's own rung rules."],
  },
  {
    number: 5,
    code: "LN",
    title: "Letter names",
    kind: "grid",
    strand: "letterNames",
    stimulus: "Page 6",
    script: [
      { do: "Open the stimulus book at page 6." },
      { say: "Here are some letters. Tell me the name of each letter. Start here and go across." },
      { do: "Point to the first letter, then sweep your finger along the first row." },
    ],
    notes: [
      'If the child gives a sound, say once only: "That is the sound. What is the name of the letter?"',
      'If the child waits more than 3 seconds, point to the next letter and say: "Try this one."',
      "Stop rule: if no letter in the first two rows is correct, stop and go to Part 6.",
    ],
  },
  {
    number: 6,
    code: "LS",
    title: "Letter sounds",
    kind: "grid",
    strand: "letterSounds",
    stimulus: "Page 7",
    script: [
      { do: "Turn to page 7." },
      { say: "Now tell me the sound each letter makes. This letter makes the sound /m/." },
      { do: "Point to the practice letter m in the box at the top." },
      { say: "Your turn. What sound does it make?" },
      { do: "Then point to the first row." },
      { say: "Start here and go across." },
    ],
    practice: "m",
    notes: [
      'If the child gives a letter name, say once only: "That is the name. What sound does it make?"',
      "Stop rule: if no sound in the first two rows is correct, stop. Gate A then applies.",
    ],
    acceptTable: LETTER_SOUND_ACCEPT,
    after: "After Part 6, check Gate A before going on.",
  },
  {
    number: 7,
    code: "CV",
    title: "CV blending",
    kind: "grid",
    strand: "wordReading",
    stimulus: "Page 8",
    script: [
      { do: "Turn to page 8. Point to the practice pair in the box." },
      { say: "Look at these two letters. Say the sounds and slide them together, like this: /s/ … /a/, sa. Your turn." },
      { do: "Then point to the first row." },
      { say: "Now read these." },
    ],
    practice: "sa",
    notes: ["The vowel must be the short sound: ti as in tin, po as in pot.", READING_WORDS_NOTE],
    after: "After Part 7, check Gate B.",
  },
  {
    number: 8,
    code: "RW",
    title: "Real words",
    kind: "grid",
    strand: "wordReading",
    stimulus: "Page 9",
    script: [{ do: "Turn to page 9." }, { say: "Here are some words. Read as many as you can. Start here and go across." }],
    notes: [
      "None of these 20 words is taught in the Level 1 course book, and each row has one word for each short vowel. Check Gate C after the first row.",
      READING_WORDS_NOTE,
    ],
  },
  {
    number: 9,
    code: "NW",
    title: "Made up words",
    kind: "grid",
    strand: "wordReading",
    stimulus: "Page 10",
    script: [
      { do: "Turn to page 10. Point to the practice word in the box." },
      { say: "These are made up words. They are not real words. Read them as best you can. This one says mib. Your turn." },
      { do: "Then point to the first row." },
    ],
    practice: "mib",
    notes: [
      "Made up words show whether the child can truly decode, because they cannot be remembered. If all 5 words in the first row are wrong, stop this part.",
      READING_WORDS_NOTE,
    ],
  },
  {
    number: 10,
    code: "HW",
    title: "Heart words",
    kind: "grid",
    strand: "heartWords",
    stimulus: "Page 11",
    script: [{ do: "Turn to page 11." }, { say: "Here are some words you may know by heart. Read as many as you can." }],
    notes: [
      "The 20 words are two from each of the ten heart word sets, in set order, so the errors show which sets to reteach. The word must be read at sight within 3 seconds. Check Gate D after the first row.",
    ],
  },
  {
    number: 11,
    code: "ST",
    title: "Story reading",
    kind: "story",
    strand: "storyQuestions",
    stimulus: "Page 12",
    script: [
      { do: "Turn to page 12." },
      {
        say: "Here is a short story. It is called Tim and the pup. Read it aloud as well as you can. When you finish, I will ask you some questions. Start here.",
      },
      { do: "Point to the first word. Start the timer when the child says the first word." },
    ],
    notes: [
      "The story is new to the child. It uses only CVC words and heart words from Level 1.",
      "Put a slash through every word that is read wrongly or skipped.",
      "If the child is stuck on a word for 3 seconds, say the word, mark it as an error and point to the next word.",
      "Check Gate E after the first line.",
      "Stop the timer when the child finishes, or at 2 minutes. Put a bracket after the last word read.",
      "Then ask the questions. Leave the story open in front of the child. Ask a question only if the child read the line it comes from.",
    ],
  },
  {
    number: 12,
    code: "AT",
    title: "Reading attitude",
    kind: "attitude",
    strand: null,
    stimulus: "Page 13",
    script: [
      { do: "Turn to page 13." },
      { say: "Now there are no right or wrong answers. Point to the face that shows how you feel." },
      { do: "Name the faces as you point:" },
      { say: "Happy. Just okay. Sad." },
    ],
    notes: ["This part is not scored. It appears on the child's report as context."],
    after: 'Finish with: "Thank you. You worked very hard today."',
  },
  {
    number: 13,
    code: "WT",
    title: "Writing",
    kind: "writing",
    strand: "writing",
    stimulus: "Writing sheet",
    groupOnPaper: true,
    script: [
      {
        do: "Give this part to a group of up to five children, seated so they cannot copy. Each child has a writing sheet and a pencil. It takes about 10 minutes. Collect the sheets and score them afterwards.",
      },
      { say: "Today you will show me how you write. If you cannot write something, leave the space empty and wait for the next one." },
    ],
    notes: [
      'Task A: "Write your name on the first line."',
      'Task B: "I will say a sound. Write the letter that makes that sound. Number 1: /s/." Say each sound twice. A small or capital letter is correct. A letter written backwards is correct only if it cannot be mistaken for another letter, so a backwards s is correct and a backwards b is not.',
      'Task C: "Now I will say a word. Listen to the sounds and write the word." Say the word, then the sentence, then the word again. Score 1 if all three letters are correct and in the right order.',
      'Task D: "Now write a whole sentence. Listen first: The red bus is big." Say the whole sentence, then say it slowly one word at a time, then say the whole sentence again.',
    ],
  },
];

// --- Strands and bands (cut points are provisional until the pilot) ----------------

const STRANDS: StrandDef[] = [
  { key: "storyListening", name: "Story listening", parts: [1], max: 5, cuts: [2, 4, 5], foundation: true, bandedAtBaseline: true },
  { key: "vocabulary", name: "Vocabulary", parts: [2], max: 10, cuts: [3, 7, 10], foundation: true, bandedAtBaseline: true },
  { key: "printConcepts", name: "Print concepts", parts: [3], max: 10, cuts: [3, 7, 10], foundation: true, bandedAtBaseline: true },
  { key: "soundAwareness", name: "Sound awareness", parts: [4], max: 45, cuts: null, foundation: true, bandedAtBaseline: true },
  { key: "letterNames", name: "Letter names", parts: [5], max: 26, cuts: [8, 19, 25], foundation: true, bandedAtBaseline: true },
  { key: "letterSounds", name: "Letter sounds", parts: [6], max: 26, cuts: [8, 19, 25], foundation: true, bandedAtBaseline: true },
  { key: "wordReading", name: "Word reading", parts: [7, 8, 9], max: 40, cuts: [12, 28, 38], foundation: false, bandedAtBaseline: false },
  { key: "heartWords", name: "Heart words", parts: [10], max: 20, cuts: [6, 14, 19], foundation: false, bandedAtBaseline: false },
  { key: "storyQuestions", name: "Story questions", parts: [11], max: 5, cuts: [2, 4, 5], foundation: false, bandedAtBaseline: false },
  { key: "writing", name: "Writing", parts: [13], max: 15, cuts: [5, 11, 15], foundation: false, bandedAtBaseline: false },
];

export const LEVEL1_FORM_A: FormDef = {
  id: FORM,
  title: "ReadWell Level 1 Baseline Assessment, Form A",
  gradeLevel: KG1,
  baseline: true,
  intro: {
    kit: [
      "This guide and the Sound Awareness Subtest script (Part 4)",
      "Learner Stimulus Book, Form A",
      "One score sheet for each child, or a device with the app",
      "Five counters, a pencil and a timer",
      "For Part 13: a writing sheet and a pencil for each child",
    ],
    beforeYouBegin: [
      "The school and the parent or guardian have agreed to the assessment.",
      "Work in a quiet corner at a table, with the child sitting beside you and not on the floor.",
    ],
    opening:
      "What is your name? Would you like to play some word games with me?",
    rules: [
      "Read the bold words exactly. They are the script.",
      "Teach on practice items only. Never correct or teach on a scored item.",
      'Praise effort, not answers. Say "Thank you" or "Good trying" whether the answer is right or wrong.',
      "Waiting time. Give 3 seconds for a letter or a word, and 5 seconds for a spoken question. Then mark 0 and move on gently.",
      "A self correction is correct.",
      "Language. Explain each task in the language the child understands best. Test words, letters and texts are always in English.",
      "Accent. Accept the sound or word as the child's community says it.",
      "Marking. Write 1 for correct and 0 for wrong or no answer. On the letter and word grids, put a slash through each error and a bracket after the last item attempted. Write NA for any part that a gate rule skips.",
    ],
    gates: [
      { gate: "A", check: "After Part 6, the letter sounds score is 4 or less", ifTrue: "Skip Parts 7, 8, 9 and 11. Give only the first row of Part 10. Go to Part 12." },
      { gate: "B", check: "After Part 7, the CV blending score is 2 or less", ifTrue: "Skip Parts 8, 9 and 11. Go to Part 10." },
      { gate: "C", check: "In Part 8, all 5 words in the first row are wrong", ifTrue: "Stop Part 8. Skip Parts 9 and 11. Go to Part 10." },
      { gate: "D", check: "In Part 10, all 5 words in the first row are wrong", ifTrue: "Stop Part 10." },
      { gate: "E", check: "In Part 11, no word in the first line is read correctly", ifTrue: "Stop Part 11. Do not ask the questions." },
    ],
    tiredNote: "If the child tires, stop after Part 6 and finish in a second sitting on the same day or the next.",
  },
  parts: PARTS,
  strands: STRANDS,
  story: { title: STORY_TITLE, lines: STORY_LINES },
  items: buildItems(),
};

export const LEVEL1_FORM_A_ITEMS = LEVEL1_FORM_A.items;

/** Strand skill areas the KG 1 content needs (vocabulary is shared with the Grade 1 starter content). */
export const LEVEL1_SKILL_AREAS: { key: StrandKey; name: string }[] = STRANDS.map((s) => ({ key: s.key, name: s.name }));
