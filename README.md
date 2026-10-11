# Read Well Assessment App

A reading assessment app built around the ReadWell programme. Students are
placed in ReadWell levels, and each level has four assessments: Form A,
Form B, Form C and the Final assessment. A trained assessor gives each one
to a child one to one on a tablet or phone, and the app applies the
guide's stop and gate rules, then generates a per-student report (each
strand's raw score and band, plus program-aligned recommendations) and a
school-wide report for administrators, both exportable as PDF. See
[Levels and assessments](#readwell-levels-and-assessments).

This implements the design handed off from Claude Design (see
[`design-handoff/`](./design-handoff)) as a full application, per the
[PRD](./design-handoff/project/uploads/Read_Well_Assessment_App_PRD.pdf) and
[TRD](./design-handoff/project/uploads/Read_Well_Assessment_App_TRD.pdf) in
that bundle: Next.js (App Router, TypeScript) + Supabase (Postgres, Auth,
Storage), matching the TRD's recommended stack.

## Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend**: Supabase (Postgres, Auth, Storage); Next.js Route Handlers for
  the assessment/scoring/report APIs
- **PDF generation**: `@react-pdf/renderer`, run via Next's `after()` so it
  never blocks the assessment-completion response
- **Hosting**: Vercel (frontend + API routes) + Supabase (db/auth/storage),
  as recommended in the TRD

## Architecture notes / assumptions

A few things the PRD/TRD left open that needed a concrete decision to ship:

- **Brand palette: orange/black/white, not the BRD/PRD's sage
  green/cream/terracotta.** Both docs specify sage green (primary), cream
  (background), and an unconfirmed accent submitted as "seraquota" and
  interpreted as terracotta pending confirmation (BRD §7.1/§10, PRD §5.1/§9)
  — that confirmation never came. Rather than leave the UI half-built
  against a placeholder color nobody signed off on, this was shipped as
  orange/black/white (`src/app/globals.css`'s `:root`, mirrored in
  `src/lib/theme.ts` for PDF/SVG rendering) and applied consistently across
  student/staff screens and generated PDFs, matching every other
  requirement in both documents except the specific hue. This is recorded
  here as the flagged, undone decision it actually is, not silently carried
  forward: swapping back to sage/cream/terracotta once real values are
  confirmed mostly means changing the hex values in those two files (and
  re-checking WCAG AA contrast against the new colors — see "Accessibility"
  below for the current palette's numbers), since every screen reads colors
  through those shared tokens rather than hardcoding hex directly —
  except `themeColor` in `src/app/layout.tsx` and `theme_color` in
  `src/app/manifest.ts` (the browser-chrome/PWA-install accent color),
  which CSS custom properties can't reach and would need updating by hand
  too.
- **A form can be given two ways** (`assessments.delivery`, 0018), and a
  level's form may have one of each; the teacher picks which when starting
  it. Given by an adult: ReadWell's assessor guides call for a trained
  adult beside the child, so the guide's version (Level 1 Form A) runs on
  the assessor screen under the teacher's or administrator's own login,
  scoped by RLS like every other staff page. As a game: the child plays it
  on their own device (the TRD's §6 kiosk, `/student`); starting one gives
  the session a join code to type at `/student/join`, or **Play here**
  opens it on the teacher's device. A check keeps `delivery` in step with
  the items (an adult-given form's items are all `assessor` items, a
  game's never are). Sessions from before levels keep their reports:
  an active game becomes its level's Form A (0017), anything else is
  switched off with `form` null, and a teacher can still review read-aloud
  answers on the report page (`reviewSpokenAnswer`, 0012).
- **Levels replace grades, and the teacher picks the form.** Students are
  placed in a level (`students.level`), and each level has Form A, Form B,
  Form C and the Final assessment (`assessments.level` + `assessments.form`,
  at most one active per level and form). When starting an assessment the
  teacher picks which of the four; only the ones added for that level can
  be picked. A database trigger (the level-match guard, 0017) guarantees a
  session's assessment is for the student's own level. To assess a child
  at another level, change their level on the Students page (this replaces
  the earlier grade-override control).
- **Overall report label.** ReadWell assessments use the guide's support
  level: 0-1 Emerging foundation strands is on track, 2-4 needs support,
  5-6 needs urgent support. Where only a generic label fits (the CSV export,
  classroom breakdown), `computeOverallLabel` in `src/lib/scoring.ts` uses
  "2+ flagged strands → Needs Support", which lines up with the guide's
  first step since a strand is flagged when it's Emerging.
- **Report generation** runs synchronously-but-non-blocking via `after()`
  (Next.js 15+) rather than a separate queue/worker, which is the pragmatic
  reading of the TRD's "must not block the assessment-completion response"
  requirement without standing up separate infrastructure for an MVP.
- **The school-wide report breaks results down by classroom as well as by
  level** (PRD open question 6: "by classroom, by grade only, or both?").
  `aggregateClassroomBreakdown` in `src/lib/scoring.ts` groups a cycle's
  results by the student's teacher, computing per-classroom average score
  and % of students flagged "Needs Support"; it's shown on the admin
  dashboard and in the exported school PDF.
- **Failed report generation now retries itself, then alerts an admin.**
  Previously a failed PDF just sat there until a human happened to notice
  the "Retry PDF" button; there was also no way to tell a generation had
  silently stalled (e.g. the serverless function running `after()` was
  killed mid-render, leaving `status` stuck at `'pending'` forever with no
  error recorded). `retryFailedReports` (`src/lib/retryFailedReports.ts`),
  run once a day by the existing `cycle-scheduler` cron (Vercel's Hobby
  plan rejects every deployment whose `vercel.json` has a cron running more
  than daily; `src/lib/vercelConfig.test.ts` now fails CI on that), applies
  the pure policy in `src/lib/reportRetry.ts`:
  automatically retry a failed or stalled report up to
  `MAX_AUTOMATIC_RETRIES` (3) times, then email and in-app-notify the
  school's administrators once (`alertStudentReportFailure`/
  `alertSchoolReportFailure` in `src/lib/reports.ts`) rather than retrying
  forever. The existing manual "Retry PDF" button is untouched and doesn't
  count against the automatic budget, and a report's `last_error` is shown
  next to that button so a human doesn't have to dig through logs
  (`supabase/migrations/0013_report_retry_tracking.sql`).
- **Sunny (the mascot) is plain static images.** The original is
  `public/sunny.png`, shown on staff screens by `src/components/SunnyAvatar.tsx`
  as an ordinary `<img>`, deliberately not `next/image`, since its on-demand
  `/_next/image` endpoint needs the server even for a local file, which would
  undo the point of caching it for offline use. The student game uses
  Sunny's moods (`public/sunny/`, see "The student game" below), plain
  `<img>`s for the same reason. `sw.js` precaches all of them on install,
  since (unlike `_next/static` chunks) nothing in the page's own HTML
  references them for the worker to discover on its own.
  `/offline/page.tsx` keeps the separate flat SVG mascot (`SunnyMascot` in
  `icons.tsx`), since that page is the last-resort fallback shown when
  there's no connection at all and shouldn't depend on an image fetch that
  might not have been cached yet.

## The student game

The game version of a form plays as a quest the child goes through on
their own device at `/student`
(`src/app/student/session/[sessionId]/StudentAssessmentRunner.tsx`).

- **Level 1 Form A as a game** (`src/lib/readwell/level1FormAGame.ts`,
  seeded by 0018) uses the guide's own thirteen parts, story, letters and
  words, adapted for a child playing alone: pointing becomes tapping a
  picture or word; naming letters becomes finding them ("Tap the letter
  s"), and letter sounds use a key word ("the first sound in sun"), since
  speech recognition can't hear a lone letter or sound; reading parts use
  the first row of each grid, read into the mic; writing is typed, with
  the words dictated. Sound awareness items are written for the game (the
  nine-rung ladder lives in a separate subtest script). The guide's
  version, given by an adult, stays the full baseline with its gates and
  bands; a game session is scored like any game, one result per skill
  area, with the story lines in a "Story reading" skill area.
- **Sunny talks a child through it.** An item's `say` is what Sunny reads
  out instead of the prompt, never shown: the choices for a child who
  can't read yet, or a word to spell. A read-aloud item never reads its
  passage, so Sunny never tells the child the word they're meant to read
  (`level1FormAGame.test.ts` checks every Level 1 item for this). A child
  who can't read a word taps **I can't read this one yet**; that's scored
  as wrong and earns no star. The game no longer sends `expectedText` to
  the device, since for a dictated word it's the spelling.
- **Pictures.** A choice that starts with an emoji shows it as a picture
  from `public/pictures/` (Twemoji, CC-BY 4.0, so it looks the same on an
  old tablet; `public/pictures/CREDITS.txt`), and `:mop:` shows
  `public/pictures/mop.svg`, drawn for pictures the guide uses that have no
  emoji. Pictures and single letters or marks show as big tiles; wordier
  choices stay a list. The service worker precaches every picture.
- **Missions and the quest map.** The questions are split into missions:
  one per ReadWell part when the item ids carry part codes (`LS01`, `SV03`,
  the Level 2 quest), otherwise every five questions. A map across a little
  sky shows the missions as a path ending in a trophy, with Sunny's face
  travelling along it. Finishing a mission shows a celebration card (and, at
  a change of sitting, "time for a little break"); finishing the quest shows
  Sunny with a trophy, a Reading Star badge and the missions stamped off.
- **Stars reward effort.** A child earns one star for each question they
  answer, whatever they answer.
- **Right and wrong, with one practice retry, and a per-form switch.** When
  a child picks an answer to a choice question, the option shakes pink with
  a ✕ if it was wrong (Sunny scratches his head, then cheers them on to try
  again) or turns green with a ✓ if it was right. After a wrong answer they
  get one more try; if that's wrong too, the right answer is shown and they
  move on. **Only the first answer is recorded and scored** (the kiosk route
  keeps it and ignores later ones), so a retry is practice and tapping until
  it turns green can't raise the score. The server says whether an answer
  was right in its reply, so there's no right/wrong without a connection:
  offline, the game stays neutral and takes the latest pick. Reading-attitude
  questions ("How do you feel about reading?") never show a mark
  (`itemGivesFeedback` in `src/lib/kiosk.ts`), and read-aloud and writing
  items don't either, since speech recognition is too noisy to call a read
  wrong.
  The ReadWell guide says never to correct a child on a scored item, so
  each game form has a **Tell children right from wrong** switch
  (`assessments.show_feedback`, 0019) in its editor on the admin Content
  page; it's on by default. Off: the game says nothing about right or wrong
  (the answer endpoint stops sending `isCorrect` at all), the child can
  change their pick until they move on, and the last pick is scored, as it
  was before feedback existed. The switch is saved with the form's
  version (saving makes a new one), so every session's assessment records
  which way it was given. The route's rules are tested in
  `src/app/api/kiosk/sessions/[sessionId]/route.test.ts`.
- **Animated Sunny** (`src/components/AnimatedSunny.tsx`). Sunny peeks over
  the top of the question card and changes mood with the moment: thinking
  while a question is open, reading for a read-aloud item, listening while
  the mic is on, a thumbs-up or a cheer once the child answers, waving
  hello, a trophy at the end. Each mood is a still; a new mood pops in with
  a squash-and-stretch, and each has its own idle motion (bounce, lean,
  tilt, rock, nod) in `globals.css`. Every animation and the confetti stop
  under the device's "reduce motion" setting.
- **How the moods were made.** One expression sheet of six poses was
  generated from `public/sunny.png` as the reference image (Nano Banana 2,
  on a flat magenta background), so every pose has the same face, clothes,
  size and lighting. The magenta was keyed out and the sheet cut into
  480x480 transparent WebP stills, each the whole grid cell so Sunny's head
  is the same size in every mood and swapping moods doesn't make him jump.
  To add a mood, generate it the same way from `sunny.png` and add it to
  `SUNNY_MOOD_SRC` and `PRECACHE_ASSETS` in `public/sw.js`.
- **Sounds and confetti** (`src/lib/gameFx.ts`). Short stingers for a
  tap, a star, a finished mission, the finished quest and a wrong answer
  are composed from the sound of Ghanaian instruments: a talking-drum glide,
  a gyil (xylophone) in the pentatonic scale, the gankogui double bell
  keeping highlife's 12/8 time, and a shekere. `scripts/make-game-sounds.py`
  synthesises them, so they're original to the project and carry no licence;
  they're inspired by those instruments, not recordings of Ghanaian
  musicians, so swap in real recordings (same file names in `public/sounds/`)
  when you have them. Played with Web Audio so the service worker can serve
  them offline. A speaker button mutes them, remembered on the device.
  Confetti is `canvas-confetti`, run without its web worker because the CSP
  allows no `blob:` workers.
- **Sunny's voice** (`src/lib/voice.ts`). Sunny speaks with recorded clips
  in a Ghanaian-accented voice (`public/voice/`, 76 lines: his reactions and
  every Level 1 prompt except the writing ones). A clip is found by a hash of
  the exact text Sunny is about to say (`src/lib/voiceKey.ts`), so a line an
  admin writes, or one that has been reworded, has no clip and is spoken by
  the device's own voice, picked as the nearest to West African English the
  device has (`en-GH`, then `en-NG`, `en-KE`, `en-ZA`, `en-GB`). The clips are
  an AI voice (Qwen Audio TTS through Higgsfield) asked for "a warm Ghanaian
  English accent, like a kind primary school teacher in Accra"; **nobody has
  checked how Ghanaian it sounds, so listen to it**. To use a real Ghanaian
  teacher's recording for any line, or to fill a gap, run
  `python3 scripts/add-voice.py recording.m4a "Tap the ram."` (any audio file;
  the text must match what Sunny says exactly). It trims, converts, and
  updates `src/lib/voiceManifest.json` and the offline list in `public/sw.js`;
  `src/lib/voice.test.ts` checks everything still fits and lists which Level
  1 lines are still unrecorded.

## ReadWell levels and assessments

Students are placed in a **ReadWell level** (Level 1 to 6 for now; raise
`MAX_LEVEL` in `src/lib/levels.ts` when the programme adds levels). Each
level has **four assessments: Form A, Form B, Form C and the Final
assessment**. The teacher picks which one a child takes each time.
**Level 1 Form A** (the ReadWell Level 1 Baseline Assessment) is the first
written; the others are added as their assessor guides arrive.

Each form can come two ways, and Level 1 Form A has both:

- **Given by an adult** (from a ReadWell assessor guide): a trained adult
  sits beside the child, who reads from the printed Learner Stimulus Book,
  and taps right or wrong for each item. The device replaces the score
  sheet and the stopwatch, not the assessor.
- **As a game** (Level 1 Form A's is seeded; others are built on the admin
  Content page): the child plays it on their own device, tapping pictures
  and words, reading aloud into the mic and typing, with Sunny talking them
  through it. See "The student game" above.

- **Giving one.** On the class list, **Start assessment** opens a choice of
  Form A, B, C and the Final assessment, each as "game the child plays"
  or "given by an adult" where it has that version; forms not yet added
  for the child's level are shown but can't be picked. A game shows its
  join code on the class list (and **Play here** to hand over this device).
  The adult-given version opens the assessor screen
  (`/teacher/assess/[sessionId]`), which shows each part's script word for
  word (bold lines to say, plain lines to do), the practice item, notes and
  accept rules. Grids are tap once for right, twice for wrong. The story
  reading part has the built-in 2-minute timer, tap-to-slash errors and the
  bracket for the last word read. The app applies the stop rules and the
  guide's gates for you, says which gate applied and why, and skips straight
  to the right part. Marks are kept on the device until the server has them,
  so a dropped connection or a reload loses nothing; an unfinished
  assessment shows **Resume** on the class list (or **Cancel**, to start a
  different form). Teachers and administrators can give assessments;
  reading specialists can't.
- **The group writing task** (Part 13 of Level 1 Form A) is given on paper,
  as the guide says. Score each child's writing sheet afterwards on their
  report page; saving re-scores the session and regenerates the reports.
- **Item banks.** Each form is a module in `src/lib/readwell/` (Level 1
  Form A is `level1FormA.ts`): the guide's wording, item codes (`L1A.LS.07`
  is Level 1, Form A, letter sounds, item 7; F is the Final assessment) and
  band tables, registered in `forms.ts`. It's seeded into `assessments` by a
  migration and `setup.sql`, and `seedSql.test.ts` fails if the SQL copy
  drifts from the code. "Paper is the master": change the guide first, then
  the module, then the SQL. The admin Content page shows each form's
  adult-given version read-only, since a free-form editor would break the
  item codes, and its game version, which can be built or edited there.
- **Scoring** (`src/lib/readwell/score.ts`) reports each strand on its own
  as a raw score and a band (Emerging / Developing / Secure / Advanced, the
  guide's table, which equals its 30/70/95 percent rule; provisional until
  the pilot). A baseline form bands only the six foundation strands; the
  rest are raw scores. The support level counts Emerging foundation
  strands. Story reading is also reported as words correct and words
  correct per minute. Skipped parts show as NA. Each scored strand is also
  written to `results` (percent of the strand's maximum, flagged when
  Emerging), so the admin dashboard, school report and CSV export work
  unchanged.
- **The gate engine** (`src/lib/readwell/flow.ts`) is one pure function of
  the marks so far, used by both the assessor screen and scoring, so they
  can't disagree. `flow.test.ts` walks each gate through the guide's cases.
- **Security.** The assessor API (`/api/assess/sessions/...`) needs a
  signed-in teacher or administrator who can already see the student
  through RLS; only then does it write, with the service role, after
  checking every mark against its item (score range, allowed answers, a
  well-formed story record).

**Still to come:**
- **Form B, Form C and the Final assessment** for Level 1, and every form
  for the other levels: send each assessor guide and it becomes a module
  like `level1FormA.ts`.
- **Level 1 Form A, Part 4 (sound awareness)** is scripted in the separate
  *Sound Awareness Subtest: Form A*. Its 45 item codes are there for the
  assessor to mark while reading the ladder from the paper script, but its
  rung rules aren't, so sound awareness has a raw score and no band, and
  the support level counts the other five foundation strands until those
  rules are added.
- Game versions of the other forms as they're written, and recommendation
  rules for each level (add them on the Content page).

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

You need a Supabase project (local via the CLI, or hosted at supabase.com).

**Option A: hosted (production or any real deployment):**
1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/setup.sql`. It's every migration in
   `supabase/migrations/` folded into one file, plus the private `reports`
   storage bucket and Level 1 Form A, and it's safe to run on a
   new project, a partly migrated one, or again on an up-to-date one. The
   `sql` CI job (`supabase/test/check-sql.sh`) checks all three on every
   push. When you add a migration, add the same change to `setup.sql`.
3. In Authentication → Users → Add user, create your administrator's login,
   then fill in the three values at the top of `supabase/bootstrap.sql`
   and run it to create your **real** first school and administrator.
   **Do not run `supabase/seed.sql` here**: that file creates two demo
   login accounts with a password published in this public repo
   (`readwell-demo`); it's only safe against a local, throwaway database.
4. Copy `.env.example` to `.env.local` and fill in your project's URL, anon
   key, and service role key (Project Settings → API). On Vercel, set the
   same three in Project Settings → Environment Variables and redeploy; all
   three must come from the same Supabase project.

**Option B: local (Supabase CLI):**
```bash
supabase start
supabase db reset   # applies migrations + seed.sql
```
Then copy the local URL/keys `supabase start` prints into `.env.local`.

### 3. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000`.

**If you seeded demo data (Option B, or ran `seed.sql` by hand):** sign in
with `rivera@lincoln-elementary.edu` (teacher) or
`chen@lincoln-elementary.edu` (administrator), password `readwell-demo` for
both. These only exist in that local database, never in a hosted one (see
the warning in `supabase/seed.sql`). To try an assessment: sign in as the
teacher, click **Start assessment** next to a student and pick **Form A**.

**If you bootstrapped a real deployment (Option A):** sign in with the
administrator account you created in `supabase/bootstrap.sql`, then use
`/admin/staff` to add real teachers/specialists and `/admin/students` (or
a teacher's own class list) to add real students with their level. Teachers
start each assessment from their class list once a cycle (`/admin/cycles`)
exists; only forms already added for the student's level can be picked.

### Offline handling

TRD §7 asks the assessment client to "tolerate brief connectivity drops
without losing in-progress answers." The assessor screen keeps every mark
in `localStorage` (keyed by session id) until the server has it, flushing
in batches as marks are made, every 5 seconds while any are waiting, and on
the browser's `online` event. The status pill says when marks are only on
the device. A reload resumes at the right part with offline marks intact.
Finishing needs the connection: it waits until every mark is saved, then
scores the assessment.

**Using the app offline.** A service worker (`public/sw.js`, registered
by `src/components/ServiceWorkerRegistrar.tsx` in production builds) keeps
a copy of every page opened on the device, plus the build's scripts and
styles. Next.js navigations fetch data rather than whole pages, so the
registrar also asks the worker to save each page as it's shown. Online,
pages always load live (network first); the saved copy is only used when
there's no connection.

- **Staff:** the roster, reports, and admin pages open offline showing the
  data from when they were last loaded, with a banner saying so. Buttons
  that change data are greyed out (`body[data-offline]` in
  `globals.css`), and `src/app/error.tsx` explains a change that couldn't
  be saved. Offline, `/` goes to the staff member's saved dashboard, and
  the login screen links back to it. Signing in still needs a connection.
- **Privacy on shared devices:** staff pages are kept in a separate cache
  (`rw-staff-*`) that's wiped on logout and on every sign-in
  (`src/lib/offline.ts`), so the next person can't open the previous staff
  member's pages. Logout works offline too (ends the session locally).
  Public pages are saved without cookies so they never hold staff data.
- **Not available offline:** anything that changes data, report PDF
  export, and pages never opened on the device (these show `/offline`).

**Installable as an app.** `src/app/manifest.ts` (Next.js's manifest route
convention, served at `/manifest.webmanifest`) and `src/app/apple-icon.png`
make "Add to Home Screen" installation available on both Android and
iOS, which matters given the offline support above is otherwise wasted if a
school can't actually put this on a shared tablet as its own app icon
rather than a browser tab. `proxy.ts`'s matcher exempts
`manifest.webmanifest` the same way it does image extensions, since the
OS's install prompt fetches it without the cookies a signed-out redirect
would otherwise send it into; `sw.js` precaches it and both icon sizes for
the same one-visit-then-offline reason as `sunny.png`.

Each deploy registers the worker as `/sw.js?v=<commit sha>`
(`NEXT_PUBLIC_BUILD_ID` in `next.config.ts`), which replaces the previous
build's saved copies. For a device to work offline it must have opened the
app online at least once after the latest deploy.

### Admin tooling

Signed in as an administrator, the top nav under `/admin` has:
- **Students**: add, edit, or delete a student; assign/unassign a reading
  specialist; bulk-import a roster from a CSV (`name,level,teacher_email`)
- **Staff**: invite a teacher/reading-specialist/administrator (creates the
  Supabase Auth user via service role and shows a one-time temp password);
  change a staff member's role, deactivate/reactivate their account, or
  force a password reset (also shown once). An admin can't deactivate or
  demote themselves from this screen.
- **Content**: pick a level to see its four assessments (each added from
  its assessor guide, so shown read-only) and its recommendation rules, and
  edit skill areas (add/rename; delete only when unused), weighting and the
  skill-area → recommendation mapping, all without a code deploy. A
  database trigger (the level-match guard, 0017) independently guarantees
  a session's assessment is for the student's own level, regardless of
  what the application code does
- **Cycles**: close the current assessment cycle and start a new one
- **Audit Log**: who viewed or exported which report, most recent first
- **Settings**: set (or clear) the school's data retention period; see
  "Data retention" below

A teacher can cancel a not-yet-completed session directly from `/teacher`
(e.g. one started by mistake, or the wrong form was picked); this
is blocked for already-completed sessions at the RLS layer, not just in
the UI.

A reading specialist signs in the same way (via the "I'm a Teacher" tile,
the login form is really just "staff sign-in"; which dashboard they land on
is driven by their actual `profiles.role`) and lands on `/specialist`, a
read-only roster of the students an administrator has assigned to them.

A teacher can also add students to their own roster directly from `/teacher`
(no admin needed); RLS restricts this to students where `teacher_id` is
themselves.

### Password reset

"Forgot your password?" on the sign-in form leads to `/login/forgot`, which
calls `supabase.auth.resetPasswordForEmail`. **For the emailed link to
redirect back correctly, set the Supabase project's Authentication → URL
Configuration → Site URL (and add a Redirect URL) to your actual deployed
origin**; by default it's `http://localhost:3000`, which only works for
local dev. This also requires the project's email sending to be working
(Supabase's built-in email service has low rate limits; configure custom
SMTP for real usage). An administrator can also force a reset for any staff
member from `/admin/staff` without relying on email at all.

### 4. Type-check / lint / test / build

```bash
npx tsc --noEmit
npx eslint .
npm test
npm run build
```

### Report generation retry

**Manual:** if a student or school report's PDF generation fails
(`student_reports`/`school_reports.status = 'failed'`), a **Retry** button
appears right where the "Export PDF" button would be: on the student
report page and the admin dashboard, respectively. It re-runs
`generateStudentReport`/`generateSchoolReport` synchronously so the page
shows the outcome immediately, and the specific error is shown next to the
button (`last_error`) so a human doesn't have to dig through logs.

**Automatic:** the daily `cycle-scheduler` cron also runs
`retryFailedReports` (`src/lib/retryFailedReports.ts`; also callable on
demand at `/api/cron/retry-failed-reports` with the `CRON_SECRET`), so
transient failures get fixed without anyone clicking anything. It applies the pure policy in
`src/lib/reportRetry.ts`'s `decideReportRetry` to every `failed` or
stalled-`pending` report (`attempted_at` unset/stale for more than 15
minutes means a previous attempt died mid-render without ever reaching a
final status): retry up to `MAX_AUTOMATIC_RETRIES` (3) times, tracked in
`retry_count` (`supabase/migrations/0013_report_retry_tracking.sql`), then
email and in-app-notify the school's administrators exactly once
(`alertStudentReportFailure`/`alertSchoolReportFailure` in
`src/lib/reports.ts`, `alerted_at`) instead of retrying forever. A manual
retry that succeeds resets the whole trail (`retry_count`, `last_error`,
`alerted_at`) so a later failure gets its own fresh budget and can alert
again. Manual retries never count against the automatic budget.

### Data retention

The PRD/TRD flag the actual retention policy as unconfirmed, so this is
opt-in and defaults to off. An administrator sets "days to keep completed
assessments" at `/admin/settings`, which writes `schools.data_retention_days`
(`supabase/migrations/0008_data_retention.sql`). A daily Vercel Cron Job
(`vercel.json`, 3am UTC) hits `/api/cron/purge-expired-data`, which deletes
completed `assessment_sessions` older than that many days for schools that
opted in; the foreign keys cascade to `responses`, `results`, and
`student_reports`, and the route also removes the corresponding PDF from
Storage first so nothing is orphaned in the `reports` bucket. Each purge run
logs one `audit_log` row per school (`action: 'data.purge_expired'`).

The route is protected by a `CRON_SECRET` env var: Vercel automatically
sends it as `Authorization: Bearer $CRON_SECRET` to its own Cron Job
requests once that variable is set on the project, and the route rejects
anything else. See `.env.example`.

### Notifications

A bell icon in the top bar (any signed-in teacher/administrator/specialist
page) links to `/notifications` and shows an unread count. Rows are written
by `src/lib/reports.ts` when report generation succeeds (a student's
teacher on `student_report_ready`, every administrator at the school on
`school_report_ready`) via the service-role client, same as `audit_log`;
there's no client-facing insert policy (`0009_notifications.sql`), only
`select`/`update` scoped to `recipient_id = auth.uid()` so a user can read
and mark as read their own notifications only.

### Testing & CI

Unit tests (Vitest) cover the pure logic: response scoring
(`evaluateResponse`), skill-area aggregation (`aggregateSkillScores`), the
overall-label rule (`computeOverallLabel`), and session-code
generation/normalization. They don't touch a database; RLS policies and
the full assessment→scoring→report pipeline are still only verified by
hand (see "Try the student flow" above); a real end-to-end test would need
a seeded Supabase instance in CI, which isn't set up yet.

`.github/workflows/ci.yml` runs type-check, lint, tests, and a build (with
placeholder Supabase env vars, no real project is touched) on every push
and PR to `main`. It doesn't include a staging deploy gate as a separate
step because Vercel's own GitHub integration already provides one: every
PR gets its own preview deployment distinct from production, *as long as
changes go through a PR rather than a direct push to `main`*.

### Accessibility

Manual passes (not a full automated audit — no axe-core/Lighthouse run,
since there's no browser available to drive one in this environment) have
found and fixed, across a few rounds:

- **Contrast.** `--color-orange-dark` (`#c2410c`) cleared AA (4.5:1) against
  white (5.2:1) but fell short against its own `--color-orange-tint`
  background (4.3:1) — the exact pairing used throughout the app for
  badges, pills, and banners (the "Needs Support" label, role badges,
  offline/error banners, notification highlights). Darkened to `#b83d0b`
  (5.7:1 / 4.7:1) in `src/app/globals.css` and mirrored in `src/lib/theme.ts`
  (PDF/SVG rendering can't read CSS custom properties, so the two have to
  be kept in sync manually — see the comments in both files for the exact
  numbers). An earlier round fixed `--color-muted`/`--color-muted-light`;
  see git history for that palette's since-superseded values.
- **Accessible names.** Added `aria-label`s to controls with no accessible
  name at all (relying on a `placeholder` alone, which isn't reliably
  exposed as a label): the forgot/reset password inputs and a few bare
  `<select>`s and placeholder-only `<input>`s in the admin content and
  skill-area editors.
- **Bypass Blocks (WCAG 2.4.1).** Added a "Skip to main content" link as
  the first focusable element on every staff/student page
  (`src/components/AppShell.tsx`), hidden until it receives keyboard
  focus, jumping past the top bar and (on admin pages) `AdminNav`'s seven
  tabs into a newly added `<main id="main-content">` landmark.
  Previously there was no way to reach page content without tabbing
  through all of it every time.
- **Focus management.** The first-run onboarding dialog
  (`src/components/Onboarding.tsx`, `role="dialog" aria-modal="true"`) now
  actually behaves like a modal: opening it moves focus to its first
  button, Tab/Shift+Tab wrap between its two buttons instead of escaping
  into the page underneath, and Escape closes it — none of which
  `aria-modal` enforces by itself in every browser/screen-reader
  combination.

**Known, deliberately unfixed**: white button text on the primary orange
background (`--color-orange`, `#ea580c`) measures 3.56:1 — enough for the
large 18px+/20px+ bold text on the biggest CTAs (student "Let's Start!",
"I'm Done!", etc.) but short of the 4.5:1 normal text needs, which several
smaller (`text-sm`, 14px bold) admin buttons using the same background
don't clear either. Fixing it means
either darkening the brand's primary accent color or resizing that text,
both of which change the approved visual design rather than just
correcting an oversight, so it's left as a flagged decision rather than
something changed unilaterally. A full audit (every color pairing,
keyboard navigation order end-to-end, real screen-reader testing) is still
open; see the CI note above about no browser/AT tooling being available
here.

## Deploying

1. Push this repo to GitHub.
2. Import it into Vercel; set the env vars from `.env.example` as Vercel
   project environment variables (development/preview/production, per the
   TRD's isolated-environments requirement; use separate Supabase projects
   per environment). `CRON_SECRET` can be any random string; Vercel
   detects it and starts sending it to the cron route automatically.
3. Run the migrations against your production Supabase project before the
   first deploy that needs them.

## Project layout

```
src/app/                 Routes (App Router)
  login/                 Staff sign-in + role tiles
  teacher/                Class list + per-student report (RLS-scoped to the signed-in teacher/specialist)
  teacher/assess/[id]/    Assessor screen: gives any level's Form A, B, C or Final assessment
  specialist/             Read-only roster of a specialist's assigned students
  admin/                  Dashboard, students, staff, content, cycles, settings (administrator only)
  notifications/          Bell-icon inbox (RLS-scoped to the signed-in user)
  api/assess/             Assessor screen save/complete (signed-in teacher/admin, RLS-checked)
  api/reports/            Signed PDF download + audit log
  api/cron/               Data-retention purge (Vercel Cron, CRON_SECRET-gated)
src/lib/
  supabase/               Browser / server (RLS) / admin (service-role) clients
  scoring.ts              Scoring Service (TRD §4.2)
  recommendations.ts      Recommendation Engine (TRD §4.3)
  reports.ts + pdf/       Report Generation Service (TRD §4.4)
  sessions.ts             Start, finish and re-score assessment sessions
  readwell/               ReadWell item banks (one module per form), gate rules, strand scoring
  levels.ts               Levels and the four forms: labels and parsing
supabase/
  migrations/             Schema + RLS + storage bucket
  seed.sql                Demo data (LOCAL DEV ONLY, never run against a hosted project)
  bootstrap.sql           Creates your real first school + administrator on a hosted project
design-handoff/           Original Claude Design bundle (BRD/PRD/TRD, chat transcript, prototype)
```

## What's out of scope (matches the PRD)

Parent/guardian access, SIS integration, district-level rollup reporting, and
native mobile apps are explicitly out of scope for this release per the PRD.
New ReadWell levels and forms need no redesign: each is a new item-bank module
and the SQL that seeds it.
