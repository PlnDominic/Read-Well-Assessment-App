# Read Well Assessment App

A Grade 1 reading assessment app: students take a grade-matched assessment on
a shared/kiosk device, and the app auto-generates a per-student report
(skill-area breakdown + program-aligned recommendations) and a school-wide
report for administrators, both exportable as PDF.

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
- **Overall report label.** "On Track" vs. "Needs Support" wasn't specified
  as a formula anywhere. `computeOverallLabel` in `src/lib/scoring.ts` uses
  "2+ flagged skill areas → Needs Support", chosen because it reproduces the
  original prototype's mock reports exactly (Amara: 1 flag → On Track;
  Diego: 4 flags → Needs Support; Layla: 0 flags → On Track).
- **Report generation** runs synchronously-but-non-blocking via `after()`
  (Next.js 15+) rather than a separate queue/worker, which is the pragmatic
  reading of the TRD's "must not block the assessment-completion response"
  requirement without standing up separate infrastructure for an MVP.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

You need a Supabase project (local via the CLI, or hosted at supabase.com).

**Option A: hosted (production or any real deployment):**
1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run every migration in `supabase/migrations/` **in
   order** (`0001_init.sql` through the highest-numbered file present).
3. Run `supabase/bootstrap.sql` to create your **real** first school and
   administrator (it walks you through creating the account in
   Authentication → Add user first, then linking it up).
   **Do not run `supabase/seed.sql` here**: that file creates two demo
   login accounts with a password published in this public repo
   (`readwell-demo`); it's only safe against a local, throwaway database.
4. Copy `.env.example` to `.env.local` and fill in your project's URL, anon
   key, and service role key (Project Settings → API).

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

This covers brief drops on a single device, not full offline-first
operation; the initial page load and sign-in still need a network
connection; there's no service worker/app-shell caching. That's
intentional scope: PRD/TRD only ask for tolerance of brief drops during an
in-progress assessment, not a fully installable offline app.

### Admin tooling

Signed in as an administrator, the top nav under `/admin` has:
- **Students**: add, edit, or delete a student; assign/unassign a reading
  specialist; bulk-import a roster from a CSV (`name,grade,teacher_email`)
- **Staff**: invite a teacher/reading-specialist/administrator (creates the
  Supabase Auth user via service role and shows a one-time temp password);
  change a staff member's role, deactivate/reactivate their account, or
  force a password reset (also shown once). An admin can't deactivate or
  demote themselves from this screen.
- **Content**: pick a grade (1–8), then edit that grade's assessment items
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

If a student or school report's PDF generation fails (`student_reports`/
`school_reports.status = 'failed'`), a **Retry** button appears right where
the "Export PDF" button would be: on the student report page and the admin
dashboard, respectively. It re-runs `generateStudentReport`/
`generateSchoolReport` synchronously so the page shows the outcome
immediately.

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

A manual pass (not a full automated audit, no axe-core/Lighthouse run,
since there's no browser available to drive one in this environment) found
and fixed concrete WCAG AA contrast failures: `--color-muted` (~3.2:1),
`--color-muted-light` (~2.6:1), and `--color-gold-text` (~4.44:1) all fell
short of the 4.5:1 required for normal text against the backgrounds they're
used on; see the comments in `src/app/globals.css` and `src/lib/theme.ts`
for the before/after values (both files are updated together since PDF/SVG
rendering reads `theme.ts`'s JS constants, not CSS custom properties).
Also added `aria-label`s to a few controls that had no accessible name
(the mic recording button, several bare `<select>`s in the admin screens).

**Known, deliberately unfixed**: white text on the primary sage-green
button background (`--color-sage`) measures ~3.6:1, enough for large/bold
text but short of 4.5:1 for the smaller buttons. Fixing it means either
darkening the brand's primary color or resizing button text, both of which
change the approved visual design rather than just correcting an
oversight, so it's left as a flagged decision rather than something I
changed unilaterally. A full audit (every color pairing, keyboard
navigation order, screen-reader testing) is still open; see the CI note
above about no browser/AT tooling being available here.

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
  specialist/             Read-only roster of a specialist's assigned students
  admin/                  Dashboard, students, staff, content, cycles, settings (administrator only)
  notifications/          Bell-icon inbox (RLS-scoped to the signed-in user)
  api/kiosk/              Session start/autosave/complete (service-role)
  api/reports/            Signed PDF download + audit log
  api/cron/               Data-retention purge (Vercel Cron, CRON_SECRET-gated)
src/lib/
  supabase/               Browser / server (RLS) / admin (service-role) clients
  scoring.ts              Scoring Service (TRD §4.2)
  recommendations.ts      Recommendation Engine (TRD §4.3)
  reports.ts + pdf/       Report Generation Service (TRD §4.4)
  kiosk.ts                Student-session helpers (response evaluation, codes)
supabase/
  migrations/             Schema + RLS + storage bucket
  seed.sql                Demo data (LOCAL DEV ONLY, never run against a hosted project)
  bootstrap.sql           Creates your real first school + administrator on a hosted project
design-handoff/           Original Claude Design bundle (BRD/PRD/TRD, chat transcript, prototype)
```

## What's out of scope (matches the PRD)

Grades other than 1, parent/guardian access, SIS integration, district-level
rollup reporting, and native mobile apps are explicitly out of scope for this
release per the PRD; the data model (e.g. `students.grade`,
`assessments.grade_level`) is shaped to extend to more grades later without a
redesign.
