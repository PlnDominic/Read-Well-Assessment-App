# Read Well Assessment App

A Grade 1 reading assessment app: students take a grade-matched assessment on
a shared/kiosk device, and the app auto-generates a per-student report
(skill-area breakdown + program-aligned recommendations) and a school-wide
report for administrators, both exportable as PDF. KG 1 uses the ReadWell
Level 1 Baseline Assessment instead, given one to one by a trained assessor
on a tablet or phone (see [KG 1](#kg-1-readwell-level-1-baseline-assessor-led)).

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
- **Students never authenticate.** Per TRD §6 ("kiosk-style, teacher-initiated"),
  a kiosk code (`session_code`, 6 random characters excluding 0/O/1/I) is
  created automatically the moment a student is added to the roster; see
  `createSessionForStudent` in `src/lib/kiosk.ts`, called from both
  `addStudent`/`addStudentToOwnRoster` (adding a student) and
  `startOrResumeAssessment` (adding a student is the common case, since most
  students are on a separate device from the staff member who added them;
  this covers the same-device case too, and re-running it after a student
  completes an assessment starts a fresh one with a new code, cycle
  permitting). The code is shown once in a banner right after adding the
  student, and persists visibly on that student's roster row at `/teacher`
  (labeled "Code: …") for as long as the session is `not_started` or
  `in_progress`, so it isn't a one-time value staff have to remember or look
  up in the database. The student enters it at `/student/join`. If the
  student is on the *same* device as the teacher, clicking **Start
  Assessment**/**Resume** on the roster redirects straight into
  `/student/session/[id]` instead of requiring the code. All student-facing
  reads/writes go through Route Handlers using the Supabase **service-role**
  client (`src/lib/supabase/admin.ts`), since there's no `auth.uid()` for
  RLS to key off of; authorization is instead enforced in application code
  against the session id / code. See the header
  comment in `supabase/migrations/0002_rls.sql` for the full rationale.
- **Fluency scoring uses the browser's Web Speech API.** The PRD/TRD don't
  name a specific ASR vendor, and every paid option (Whisper, Deepgram,
  AssemblyAI, Google Speech-to-Text) needs an account/API key this project
  doesn't have, so mic items are scored with `SpeechRecognition` /
  `webkitSpeechRecognition`, which is free and built into Chrome and Edge
  (see `src/types/speech-recognition.d.ts` for the ambient types it needs,
  since they're not in `lib.dom.d.ts`). **Firefox and Safari don't
  implement it**; `StudentAssessmentRunner.tsx`'s `toggleMic` detects that
  and falls back to the original "tap to mark attempted" flow.
  Each mic item can define an `expectedText` (set via the "Expected
  word/phrase" field in the admin content editor); `evaluateResponse` in
  `src/lib/kiosk.ts` normalizes both the transcript and `expectedText`
  (lowercase, strip punctuation, collapse whitespace) and does a lenient
  substring match rather than exact equality, since early readers'
  transcripts are noisy and a false "wrong" is worse than a false "right"
  here. Two fallbacks keep old behavior intact: the `"attempted"` sentinel
  (from the no-SpeechRecognition-support path) always counts as correct,
  and a mic item with no `expectedText` configured counts any non-empty
  attempt as correct.
  Because the transcript can still mishear an early reader, the student's
  teacher (or an administrator) can review each read-aloud answer on the
  report page and mark it correct or incorrect, or undo that. This calls
  `reviewSpokenAnswer` in
  `src/app/teacher/students/[studentId]/report/actions.ts`, which
  re-scores the session and re-renders both PDFs. The automatic score is
  kept in `responses.auto_is_correct`
  (`supabase/migrations/0012_response_review.sql`), and each review is
  written to the audit log. Reading specialists stay read-only.
- **Teachers (and administrators) can override a student's grade-matched
  assessment**, answering PRD open question 3 ("Should teachers be able to
  override/reassign a student's grade-level assessment, and under what
  conditions?") in the affirmative, gated the way PRD §4.1's acceptance
  criterion asks: "blocked or requires explicit override with a warning."
  `GradeOverrideControl.tsx` on the teacher roster shows a confirm dialog
  naming exactly what's about to happen (e.g. "starts Amara's next
  assessment with Grade 2 content instead of the automatically matched
  Grade 1 content") before calling `overrideAssessmentGrade`
  (`src/app/teacher/actions.ts`), which re-validates server-side via
  `validateGradeOverride`/`overrideStudentGrade` in `src/lib/kiosk.ts` and
  logs an `assessment.grade_override` audit_log row. Only available before
  a session starts (`status = 'not_started'`), since overriding one already
  in progress would discard answers already recorded against the original
  assessment's items. A session whose content grade ends up differing from
  the student's own enrolled grade shows that plainly on both the report
  page and the PDF ("Assessed with Grade X content (grade override)")
  rather than silently using the mismatched grade's `recommendation_rules`
  — the teacher report page previously did use the student's enrolled
  grade for that lookup regardless of which assessment the session
  actually used, a latent bug this override feature would otherwise have
  turned into an observable one; fixed alongside it to use the session's
  actual `assessments.grade_level` (`contentGradeLevel`, matching what the
  PDF generator already did in `lib/reports.ts`).
- **Overall report label.** "On Track" vs. "Needs Support" wasn't specified
  as a formula anywhere. `computeOverallLabel` in `src/lib/scoring.ts` uses
  "2+ flagged skill areas → Needs Support", chosen because it reproduces the
  original prototype's mock reports exactly (Amara: 1 flag → On Track;
  Diego: 4 flags → Needs Support; Layla: 0 flags → On Track).
- **Report generation** runs synchronously-but-non-blocking via `after()`
  (Next.js 15+) rather than a separate queue/worker, which is the pragmatic
  reading of the TRD's "must not block the assessment-completion response"
  requirement without standing up separate infrastructure for an MVP.
- **Assessment questions and passages are read aloud** on the student
  screen (`StudentAssessmentRunner.tsx`), per the PRD/BRD's "minimal
  reliance on reading instructions independently." This uses the browser's
  built-in Web Speech *Synthesis* API — the read-aloud counterpart to the
  SpeechRecognition used for mic items, same reasoning as `evaluateResponse`
  in `src/lib/kiosk.ts`: free, no account/API key, broadly supported.
  Each question plays automatically once the student taps "Let's Start!"
  (the user gesture Safari/iOS requires before it will play audio at all),
  and a speaker button lets them replay it. Devices without
  SpeechSynthesis support just don't show the button; nothing else in the
  flow depends on it.
- **The school-wide report breaks results down by classroom as well as by
  grade** (PRD open question 6: "by classroom, by grade only, or both?").
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
- **Sunny (the mascot) is a plain static image** (`public/sunny.png`), shown
  by `src/components/SunnyAvatar.tsx` as an ordinary `<img>` — deliberately
  not `next/image`, since its on-demand `/_next/image` endpoint needs the
  server even for a local file, which would undo the point of caching it for
  offline use. `sw.js` precaches `/sunny.png` on install for exactly that
  reason (same as the public pages), since — unlike `_next/static` chunks —
  nothing in the page's own HTML references it for the worker to discover on
  its own. `/offline/page.tsx` keeps the separate flat SVG mascot
  (`SunnyMascot` in `icons.tsx`) instead of switching to `SunnyAvatar`, since
  that page is the last-resort fallback shown when there's no connection at
  all and shouldn't depend on an image fetch that might not have been cached
  yet.

## KG 1: ReadWell Level 1 baseline (assessor-led)

KG 1 students take the **ReadWell Level 1 Baseline Assessment, Form A**
(thirteen parts, ten strands of early literacy), built from the assessor
guide. Unlike the Grade 1 kiosk, the child never touches the device: a
trained adult sits beside the child, who reads from the printed Learner
Stimulus Book, and the adult taps right or wrong for each item. The device
replaces the score sheet and the stopwatch, not the assessor.

- **Grades.** KG 1 is stored as grade `-1` and KG 2 as `0`, so kindergarten
  sorts below Grade 1 (`src/lib/grades.ts`). Every grade picker offers
  KG 1 and KG 2, and the roster CSV import accepts `KG1`/`KG2`.
- **Giving it.** On the class roster, Start Assessment for a KG 1 student
  opens the assessor screen (`/teacher/assess/[sessionId]`) rather than the
  kiosk; there's no session code to type. The screen shows each part's
  script word for word (bold lines to say, plain lines to do), the practice
  item, notes and accept rules. Grids are tap once for right, twice for
  wrong. The story reading part has the built-in 2-minute timer, tap-to-slash
  errors and the bracket for the last word read. The app applies the stop
  rules and **Gates A to E** for you, says which gate applied and why, and
  skips straight to the right part. Marks are kept on the device until the
  server has them, so a dropped connection or a reload mid-session loses
  nothing; Pause returns to the class and Resume picks up where you left
  off. Teachers and administrators can give it; reading specialists can't.
- **Part 13 (writing)** is given to a small group on paper, as the guide
  says. Score each child's writing sheet afterwards on their report page;
  saving re-scores the session and regenerates the reports.
- **The item bank** is `src/lib/readwell/level1FormA.ts`: the guide's
  wording, item codes (`L1A.LS.07` is Level 1, Form A, letter sounds,
  item 7) and band tables. It's seeded into `assessments` (grade `-1`) by
  `supabase/migrations/0016_readwell_level1_kg1.sql` and `setup.sql`, and
  `src/lib/readwell/seedSql.test.ts` fails if either SQL copy drifts from
  the code. "Paper is the master": change the guide first, then this file,
  then the SQL. The admin Content page shows the form read-only, since the
  free-form editor would break the item codes.
- **Scoring** (`src/lib/readwell/score.ts`) reports each strand on its own
  as a raw score and a band (Emerging / Developing / Secure / Advanced,
  the guide's table, which equals its 30/70/95 percent rule; provisional
  until the pilot). At baseline only the six foundation strands are banded;
  word reading, heart words, story questions and writing are raw scores.
  The support level counts Emerging foundation strands: 0-1 on track for
  Level 1, 2-4 needs support, 5-6 needs urgent support. Story reading is
  also reported as words correct out of 40 and words correct per minute.
  Skipped parts show as NA. Each scored strand is also written to `results`
  (percent of the strand's maximum, flagged when Emerging), so the admin
  dashboard, school report and CSV export work unchanged.
- **The gate engine** (`src/lib/readwell/flow.ts`) is one pure function of
  the marks so far, used by both the assessor screen and scoring, so they
  can't disagree. `flow.test.ts` walks each gate through the guide's cases.
- **Security.** The assessor API (`/api/assess/sessions/...`) needs a
  signed-in teacher or administrator who can already see the student
  through RLS; only then does it write, with the service role, after
  checking every mark against its item (score range, allowed answers, a
  well-formed story record). The unauthenticated kiosk routes and code
  entry refuse assessor-led sessions.

**Still to come, from the guide's own list:**
- **Part 4, sound awareness**, is scripted in the separate *Sound Awareness
  Subtest: Form A*, which isn't in the app yet. Its 45 item codes
  (SA1.1 to SA9.5) are there for the assessor to mark while reading the
  ladder from the paper script, but its rung rules aren't, so sound
  awareness has a raw score and no band, and the support level counts the
  other five foundation strands until those rules are added.
- **Form B** (post programme, where every strand is banded), a **child
  view** of the letters and words on the device, the digital-led (child
  taps) mode, and KG 1 recommendation rules (add them on the Content page
  under KG 1).

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
   storage bucket, starter Grade 1 content and the KG 1 ReadWell Level 1
   form, and it's safe to run on a
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
the warning in `supabase/seed.sql`). To try the student flow: sign in as
the teacher, add a new student and a kiosk code appears in a banner right
away (and stays visible on their roster row after that). Enter it at
`/student/join` to test the separate-device path, or click **Start
Assessment** next to a student on the roster instead to go straight into
that student's assessment on the current device (simulating handing it to
them).

**If you bootstrapped a real deployment (Option A):** sign in with the
administrator account you created in `supabase/bootstrap.sql`, then use
`/admin/staff` to add real teachers/specialists and `/admin/students` (or
a teacher's own roster page) to add real students. Each one gets a kiosk
code immediately, as long as a cycle (`/admin/cycles`) and an active
assessment for their grade (`/admin/content`) already exist.

### Offline handling

TRD §7 asks the assessment client to "tolerate brief connectivity drops
without losing in-progress answers." `StudentAssessmentRunner` caches three
things in `localStorage`, keyed by session id, to make that concrete:

- **Unsent answers**: every response is queued locally the instant it's
  picked, then flushed to the server in the background (on selection, every
  6s while anything's queued, and immediately on the browser's `online`
  event). A student can keep answering questions while offline; nothing is
  lost, it just syncs late.
- **Last-known server state**: if the *very first* load of the assessment
  happens while offline (`fetch` throws rather than resolving), the runner
  falls back to whatever was cached from the last successful load instead
  of showing a dead-end error, and shows a persistent "You're offline"
  banner. It retries the real fetch automatically once the `online` event
  fires.
- **A pending-finish flag**: if the final "I'm Done!" tap can't reach the
  server (offline, or a one-off failure), the student sees an "Almost
  done!" screen instead of a false "You're all done," and completion is
  retried automatically on reconnect (or manually via a "Try again"
  button). The flag survives a page reload, so closing and reopening the
  kiosk tab doesn't lose the fact that the student already tried to finish.

**Using the app offline.** A service worker (`public/sw.js`, registered
by `src/components/ServiceWorkerRegistrar.tsx` in production builds) keeps
a copy of every page opened on the device, plus the build's scripts and
styles. Next.js navigations fetch data rather than whole pages, so the
registrar also asks the worker to save each page as it's shown. Online,
pages always load live (network first); the saved copy is only used when
there's no connection.

- **Students:** the login screen, "I'm a Student", and any assessment
  already opened on the device work offline. Entering a code that was
  opened here goes straight back into that assessment (the runner records
  code → session in `localStorage`), resuming at the right question with
  offline answers intact. A code never used on the device can't work
  offline, since only the server knows which student it belongs to.
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
make "Add to Home Screen"/kiosk installation available on both Android and
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
  specialist; bulk-import a roster from a CSV (`name,grade,teacher_email`)
- **Staff**: invite a teacher/reading-specialist/administrator (creates the
  Supabase Auth user via service role and shows a one-time temp password);
  change a staff member's role, deactivate/reactivate their account, or
  force a password reset (also shown once). An admin can't deactivate or
  demote themselves from this screen.
- **Content**: pick a grade (1-8), then edit that grade's assessment items
  (choice/mic, options, correct answers), its skill areas (add/rename;
  delete only when unused), and its skill-area → recommendation mapping,
  all without a code deploy. Saving the assessment creates a new version
  rather than mutating in place, so already-completed sessions keep
  pointing at the exact content they were scored against. A database
  trigger (`0006_grade_match_guard.sql`) independently guarantees a
  session's assessment always matches the student's own grade, regardless
  of what the application code does
- **Cycles**: close the current assessment cycle and start a new one
- **Audit Log**: who viewed or exported which report, most recent first
- **Settings**: set (or clear) the school's data retention period; see
  "Data retention" below

A teacher can cancel a not-yet-completed session directly from `/teacher`
(e.g. one started by mistake, or to hand the student a fresh code); this
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
  exposed as a label): the student kiosk-code input, the forgot/reset
  password inputs, a few bare `<select>`s and placeholder-only `<input>`s
  in the admin content/skill-area editors, and the per-option radio
  buttons in the assessment item editor (which previously had no way to
  tell them apart by name at all).
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
  student/join/          Kiosk session-code entry (unauthenticated)
  student/session/[id]/  The assessment itself (unauthenticated, service-role backed)
  teacher/                Roster + per-student report (RLS-scoped to the signed-in teacher/specialist)
  teacher/assess/[id]/    Assessor screen for assessor-led forms (KG 1, ReadWell Level 1)
  specialist/             Read-only roster of a specialist's assigned students
  admin/                  Dashboard, students, staff, content, cycles, settings (administrator only)
  notifications/          Bell-icon inbox (RLS-scoped to the signed-in user)
  api/kiosk/              Session start/autosave/complete (service-role)
  api/assess/             Assessor screen save/complete (signed-in teacher/admin, RLS-checked)
  api/reports/            Signed PDF download + audit log
  api/cron/               Data-retention purge (Vercel Cron, CRON_SECRET-gated)
src/lib/
  supabase/               Browser / server (RLS) / admin (service-role) clients
  scoring.ts              Scoring Service (TRD §4.2)
  recommendations.ts      Recommendation Engine (TRD §4.3)
  reports.ts + pdf/       Report Generation Service (TRD §4.4)
  kiosk.ts                Student-session helpers (response evaluation, codes)
  readwell/               ReadWell Level 1 item bank, gate rules, strand scoring (KG 1)
  grades.ts               KG 1 / KG 2 / Grade n labels and parsing
supabase/
  migrations/             Schema + RLS + storage bucket
  seed.sql                Demo data (LOCAL DEV ONLY, never run against a hosted project)
  bootstrap.sql           Creates your real first school + administrator on a hosted project
design-handoff/           Original Claude Design bundle (BRD/PRD/TRD, chat transcript, prototype)
```

## What's out of scope (matches the PRD)

Grades other than KG 1 and 1, parent/guardian access, SIS integration, district-level
rollup reporting, and native mobile apps are explicitly out of scope for this
release per the PRD; the data model (e.g. `students.grade`,
`assessments.grade_level`) is shaped to extend to more grades later without a
redesign.
