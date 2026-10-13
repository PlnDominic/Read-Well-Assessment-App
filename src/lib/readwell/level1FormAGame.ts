import type { AssessmentItem } from "@/lib/database.types";

/**
 * ReadWell Level 1 Form A as a game the child plays on their own device:
 * the same thirteen parts, story, letters and words as the assessor guide
 * (level1FormA.ts), adapted so a child can answer alone. The assessor-led
 * Form A stays the full baseline; the teacher picks which way to give it.
 *
 * What changed for the game, part by part:
 * - Pointing becomes tapping: vocabulary, print concepts and the story
 *   questions are picture or word choices, and Sunny reads the choices
 *   aloud (`say`) so a child who can't read yet can still answer.
 * - Naming letters becomes finding them ("Tap the letter s"), and letter
 *   sounds use a key word ("the first sound in sun"), because speech
 *   recognition can't hear a single letter or sound reliably.
 * - Reading parts (CV, real words, made up words, heart words, the story)
 *   are read into the mic. Sunny never says the word: `say` replaces the
 *   spoken prompt. The first row of each grid is used, the rows the guide's
 *   stop rules look at. Teachers can re-mark read-aloud answers on the
 *   report.
 * - Both stories are cut to three sentences, with three questions each, so a
 *   child isn't loaded with a long story to hold in mind (the guide's
 *   versions are longer; the adult-given Form A keeps them).
 * - Sound awareness: the nine-rung ladder lives in a separate subtest
 *   script, so these eight items are written for the game (rhyme, first
 *   sound, last sound, syllables, blending).
 * - Writing is typed: the name, five letter sounds, four dictated words and
 *   the dictated sentence, scored on spelling.
 *
 * Item ids start with the part code (LC01, VO01, ...), which is how the
 * game groups them into missions (StudentAssessmentRunner.tsx). Option
 * pictures: a leading emoji is drawn from public/pictures/<codepoints>.svg
 * (Twemoji), and a leading :name: from public/pictures/<name>.svg.
 *
 * The SQL that seeds these (migration 0018 and supabase/setup.sql) must
 * match this file; level1FormAGame.test.ts fails until it does.
 */

type Choice = [text: string, correct?: boolean];

function choice(id: string, skillAreaKey: string, prompt: string, options: Choice[], extra: Partial<AssessmentItem> = {}): AssessmentItem {
  return {
    id,
    skillAreaKey,
    type: "choice",
    prompt,
    ...extra,
    options: options.map(([text, correct]) => ({ text, isCorrect: !!correct })),
  };
}

function mic(id: string, skillAreaKey: string, passage: string, prompt: string, extra: Partial<AssessmentItem> = {}): AssessmentItem {
  return { id, skillAreaKey, type: "mic", prompt, passage, expectedText: passage, ...extra };
}

function text(id: string, prompt: string, say: string, expectedText?: string): AssessmentItem {
  return { id, skillAreaKey: "writing", type: "text", prompt, say, ...(expectedText ? { expectedText } : {}) };
}

const n2 = (n: number) => String(n).padStart(2, "0");

/** Puts the correct option in a set position so answers don't always sit first. */
function placed(correct: string, distractors: string[], position: number): Choice[] {
  const out: Choice[] = distractors.map((d) => [d]);
  out.splice(position % (distractors.length + 1), 0, [correct, true]);
  return out;
}

// --- Part 1: Story listening (the guide's story cut to three sentences, read once by Sunny) ----------

const STORY_LISTENING_TEXT =
  "Kwaku has a little brown goat. One day the gate was open, and the goat ran away. Kwaku found the goat in the kitchen, eating the yam!";

const LC: [prompt: string, say: string, options: Choice[]][] = [
  ["What animal does Kwaku have?", "What animal does Kwaku have? A goat, a hen, or a dog?", [["🐐 A goat", true], ["🐔 A hen"], ["🐕 A dog"]]],
  ["Why was the goat able to run away?", "Why was the goat able to run away? The gate was open, it was raining, or Kwaku was asleep?", [["🚪 The gate was open", true], ["🌧️ It was raining"], ["😴 Kwaku was asleep"]]],
  ["Where did Kwaku find the goat?", "Where did Kwaku find the goat? Under the mango tree, behind the house, or in the kitchen?", [["🥭 Under the mango tree"], ["🏠 Behind the house"], ["🍳 In the kitchen", true]]],
];

// --- Part 2: Vocabulary (the guide's words and pictures, in its order) -------

// word, pictures left to right, correct position (1-based), as in the guide.
// The guide's mop, gate and roof have no emoji, so they're drawn
// (public/pictures/mop.svg, gate.svg, roof.svg); a table becomes a bed and
// a driver a taxi, the nearest pictures there are.
const VO: [word: string, pictures: string[], correct: number][] = [
  ["ram", ["🐔", "🐏", "🐕", "🐟"], 2],
  ["web", ["🥅", "🪢", "🕸️", "🪺"], 3],
  ["hut", ["🛖", "⛺", "🚗", "🌳"], 1],
  ["mop", ["🧹", "🖌️", "🪣", ":mop:"], 4],
  ["tin", ["☕", "🥫", "🧴", "🧺"], 2],
  ["bucket", ["🍲", "🥣", "🧺", "🪣"], 4],
  ["ladder", ["🪜", "🪑", "🛏️", "🚪"], 1],
  ["bridge", ["🛣️", "🏞️", "🌉", ":gate:"], 3],
  ["roof", ["🪟", ":roof:", "🚪", "🧱"], 2],
  ["farmer", ["🧑‍🏫", "🚕", "🧑‍🌾", "🧑‍⚕️"], 3],
];

// --- Part 3: Print concepts (the guide's ten, on screen) --------------------

const PAGE = "Kofi has a red hat.\nHe sits on a mat.";

// --- Part 4: Sound awareness (written for the game) --------------------------

const SA: [prompt: string, say: string, options: Choice[]][] = [
  ["Which one rhymes with cat?", "Which one rhymes with cat? Sun, hat, or cup?", [["☀️ sun"], ["🎩 hat", true], ["☕ cup"]]],
  ["Which one rhymes with pen?", "Which one rhymes with pen? Ten, pig, or box?", [["🔟 ten", true], ["🐖 pig"], ["📦 box"]]],
  ["Which one rhymes with log?", "Which one rhymes with log? Bed, bus, or dog?", [["🛏️ bed"], ["🚌 bus"], ["🐕 dog", true]]],
  ["Which one starts like sun?", "Which one starts with the same sound as sun? Map, sock, or pig?", [["🗺️ map"], ["🧦 sock", true], ["🐖 pig"]]],
  ["Which one starts like mango?", "Which one starts with the same sound as mango? Moon, fish, or tap?", [["🌙 moon", true], ["🐟 fish"], ["🚰 tap"]]],
  ["Which one ends like goat?", "Which one ends with the same sound as goat? Sun, dog, or cat?", [["☀️ sun"], ["🐕 dog"], ["🐈 cat", true]]],
  ["How many claps in banana?", "Clap the parts of the word banana. Ba, na, na. How many claps? One, two, or three?", [["1"], ["2"], ["3", true]]],
  ["What word is it?", "Listen. Ba... nana. What word is it? Apple, banana, or pineapple?", [["🍎 apple"], ["🍌 banana", true], ["🍍 pineapple"]]],
];

// --- Parts 5 and 6: Letter names and letter sounds ----------------------------

// The first row and the start of the second, from the guide's grids.
const LN_LETTERS = ["s", "m", "a", "t", "o", "b", "k", "e", "w", "d"];
const LS_LETTERS = ["a", "t", "s", "m", "p", "n", "g", "i", "h", "d"];

// Letters a child is likely to mix up with each one.
const LOOK_ALIKE: Record<string, [string, string]> = {
  a: ["o", "e"], b: ["d", "p"], d: ["b", "p"], e: ["a", "c"], g: ["q", "j"], h: ["n", "k"], i: ["l", "j"],
  k: ["h", "x"], m: ["n", "w"], n: ["m", "h"], o: ["a", "c"], p: ["q", "b"], s: ["z", "c"], t: ["f", "l"], w: ["m", "v"],
};

// How Sunny says each letter's name, so speech doesn't read "a" as "uh".
const LETTER_NAME: Record<string, string> = {
  a: "ay", b: "bee", d: "dee", e: "ee", k: "kay", m: "em", o: "oh", s: "ess", t: "tee", w: "double you",
};

// A key word for each letter sound, from things children in the guide's
// stories know (the guide's own: g as in goat, y as in yam).
const KEY_WORD: Record<string, [word: string, emoji: string]> = {
  a: ["apple", "🍎"], t: ["tap", "🚰"], s: ["sun", "☀️"], m: ["mango", "🥭"], p: ["pot", "🍲"],
  n: ["net", "🥅"], g: ["goat", "🐐"], i: ["ink", "🖋️"], h: ["hen", "🐔"], d: ["dog", "🐕"],
};

// --- Parts 7 to 10: reading, the first row of each of the guide's grids -----

const CV = ["ma", "fe", "ti", "po", "su"];
const RW = ["gap", "den", "rip", "jog", "bug"];
const NW = ["vap", "teg", "nim", "dob", "fum"];
const HW = ["the", "of", "she", "have", "are"];

// --- Part 11: Story reading (the guide's story cut to three lines, three questions) ---------------

const STORY_LINES = [
  "Tim has a big red bag.",
  "A pup hid in the bag.",
  "Now Tim is happy.",
];

const STQ: [prompt: string, say: string, options: Choice[]][] = [
  ["What does Tim have?", "What does Tim have? A big red bag, a hat, or a cup?", [["🎒 A big red bag", true], ["🎩 A hat"], ["☕ A cup"]]],
  ["Where did the pup hide?", "Where did the pup hide? Under the bed, in the bag, or up a tree?", [["🛏️ Under the bed"], ["👜 In the bag", true], ["🌳 Up a tree"]]],
  ["Why do you think Tim is happy at the end?", "Why do you think Tim is happy at the end? He lost his bag, he has a new friend, or it is raining?", [["🎒 He lost his bag"], ["🐶 He has a new friend", true], ["🌧️ It is raining"]]],
];

// --- Part 12: Reading attitude (not scored; no wrong answer) ----------------

const FACES: Choice[] = [["😀 Happy", true], ["😐 Just okay", true], ["😢 Sad", true]];
const AT: [prompt: string, options: Choice[]][] = [
  ["How do you feel when someone reads a story to you?", FACES],
  ["How do you feel when you look at books by yourself?", FACES],
  ["How do you feel about learning to read?", FACES],
  ["Does someone at home read or tell stories with you?", [["👍 Yes", true], ["🙂 Sometimes", true], ["👎 No", true]]],
];

// --- Part 13: Writing (the guide's tasks, typed) ----------------------------

const WT_SOUNDS: [letter: string, word: string][] = [["s", "sun"], ["m", "mango"], ["t", "tap"], ["b", "ball"], ["i", "ink"]];
const WT_WORDS: [word: string, sentence: string][] = [
  ["tag", "The shirt has a tag."],
  ["peg", "Hang the cloth with a peg."],
  ["job", "My mother has a job."],
  ["bun", "I ate a bun."],
];
const WT_SENTENCE = "The red bus is big.";

function buildItems(): AssessmentItem[] {
  const items: AssessmentItem[] = [];

  LC.forEach(([prompt, say, options], i) =>
    items.push(
      choice(`LC${n2(i + 1)}`, "storyListening", prompt, options, {
        say: i === 0 ? `Listen to my story. ${STORY_LISTENING_TEXT} Now answer my questions. ${say}` : say,
      })
    )
  );

  VO.forEach(([word, pictures, correct], i) =>
    items.push(
      choice(`VO${n2(i + 1)}`, "vocabulary", `Tap the ${word}.`, pictures.map((p, j) => [p, j === correct - 1]), {
        say: `Tap the ${word}.`,
      })
    )
  );

  const cp: [string, string, Choice[], Partial<AssessmentItem>?][] = [
    ["Tap the front of the book.", "Tap the front of the book.", [[":book-back:"], [":book-front:", true], ["📖"]]],
    ["Tap the back of the book.", "Tap the back of the book.", [[":book-front:"], ["📖"], [":book-back:", true]]],
    ["Which book is the right way up, ready to read?", "Which book is the right way up, ready to read?", [[":book-upside-down:"], [":book-front:", true], [":book-back:"]]],
    ["Where do you start reading? Tap the first word.", "Look at the page. Where do you start reading? Tap the first word.", [["mat"], ["Kofi", true], ["red"]], { passage: PAGE }],
    ["Which arrow shows the way we read along a line?", "Which arrow shows the way we read along a line?", [["⬅️"], ["⬆️"], ["➡️", true]], { passage: PAGE }],
    ["At the end of a line, where do you go next?", "At the end of a line, where do you go next? To the start of the next line, back to the top, or off the page?", [["↙️ To the start of the next line", true], ["⬆️ Back to the top"], ["➡️ Off the page"]], { passage: PAGE }],
    ["Tap just one letter.", "Tap just one letter.", [["Kofi"], ["K", true], ["a red hat"]]],
    ["Tap just one word.", "Tap just one word.", [["h"], ["a red hat"], ["hat", true]]],
    ["Tap a capital letter.", "Tap a capital letter.", [["e"], ["K", true], ["s"]]],
    ["Tap a full stop.", "Tap a full stop.", [[","], ["?"], [".", true]]],
  ];
  cp.forEach(([prompt, say, options, extra], i) =>
    items.push(choice(`CP${n2(i + 1)}`, "printConcepts", prompt, options, { say, ...extra }))
  );

  SA.forEach(([prompt, say, options], i) => items.push(choice(`SA${n2(i + 1)}`, "soundAwareness", prompt, options, { say })));

  LN_LETTERS.forEach((letter, i) =>
    items.push(
      choice(`LN${n2(i + 1)}`, "letterNames", `Tap the letter ${letter}.`, placed(letter, LOOK_ALIKE[letter], i), {
        say: `Find the letter ${LETTER_NAME[letter]}. Tap it.`,
      })
    )
  );

  LS_LETTERS.forEach((letter, i) => {
    const [word, emoji] = KEY_WORD[letter];
    items.push(
      choice(`LS${n2(i + 1)}`, "letterSounds", `Which letter makes the first sound in "${word}"? ${emoji}`, placed(letter, LOOK_ALIKE[letter], i + 1), {
        say: `Which letter makes the first sound in ${word}? ${word}.`,
      })
    );
  });

  CV.forEach((w, i) =>
    items.push(mic(`CV${n2(i + 1)}`, "wordReading", w, "Slide the sounds together and say it.", i === 0 ? { say: "Look at these two letters. Say the sounds and slide them together. Then tap the mic and say it." } : {}))
  );
  RW.forEach((w, i) =>
    items.push(mic(`RW${n2(i + 1)}`, "wordReading", w, "Read this word out loud.", i === 0 ? { say: "Here are some words. Tap the mic and read each one out loud." } : {}))
  );
  NW.forEach((w, i) =>
    items.push(mic(`NW${n2(i + 1)}`, "wordReading", w, "Read this made up word.", i === 0 ? { say: "These are made up words. They are not real words. Read them as best you can." } : {}))
  );
  HW.forEach((w, i) =>
    items.push(mic(`HW${n2(i + 1)}`, "heartWords", w, "Read this word out loud.", i === 0 ? { say: "Here are some words you may know by heart. Read each one out loud." } : {}))
  );

  STORY_LINES.forEach((line, i) =>
    items.push(
      mic(`ST${n2(i + 1)}`, "storyReading", line, "Read this line of the story out loud.", i === 0 ? { say: "Here is a short story. It is called Tim and the pup. Read it out loud, one line at a time." } : {})
    )
  );
  STQ.forEach(([prompt, say, options], i) =>
    items.push(choice(`ST${n2(STORY_LINES.length + i + 1)}`, "storyQuestions", prompt, options, { say }))
  );

  AT.forEach(([prompt, options], i) =>
    items.push(
      choice(`AT${n2(i + 1)}`, "readingAttitude", prompt, options, {
        say: `${i === 0 ? "There are no right or wrong answers. " : ""}${prompt} ${options.map(([t]) => t.replace(/^\S+\s/, "")).join(", ")}?`,
      })
    )
  );

  items.push(text("WT01", "Write your name.", "Write your name."));
  WT_SOUNDS.forEach(([letter, word], i) =>
    items.push(text(`WT${n2(i + 2)}`, "Write the letter for the first sound you hear.", `Write the letter for the first sound in ${word}. ${word}.`, letter))
  );
  WT_WORDS.forEach(([word, sentence], i) =>
    items.push(text(`WT${n2(i + 7)}`, "Write the word you hear.", `Write the word ${word}. ${sentence} ${word}.`, word))
  );
  items.push(
    text(
      "WT11",
      "Write the sentence you hear.",
      `Write this sentence. ${WT_SENTENCE} ${WT_SENTENCE.replace(/\.$/, "").split(" ").join("... ")}. ${WT_SENTENCE}`,
      WT_SENTENCE
    )
  );

  return items;
}

export const LEVEL1_FORM_A_GAME_ITEMS: AssessmentItem[] = buildItems();
