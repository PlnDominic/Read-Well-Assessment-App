# Releasing safely

Settings that live in GitHub, Vercel and Supabase, not in the code. Do these once; the code and CI already assume them.

## GitHub (Settings > Branches > add rule for `main`)
- Require a pull request before merging, and one approval (the CODEOWNERS file asks for the owner).
- Require status checks to pass: `build`, `sql`, `a11y`, `analyze`.
- Block force pushes and deletion of `main`.
- Settings > Code security: turn on Dependabot alerts, secret scanning and push protection.
- Delete branches that are merged or old (`kg1-readwell-level1`, `levels-with-game`, `readwell-levels`, `security-hardening`, `claude/project-feature-roadmap-magu6u`).

## Vercel
- Project > Settings > Git: tick "Require successful checks" (or use a Deployment Protection rule) so a red build is never promoted.
- Keep Production on `main`; every other branch gets a Preview URL with its own environment variables.
- Use a separate Supabase project for Preview (staging) so a test never touches children's data.
- Pro plan before wider rollout: Hobby is for non-commercial use, has no SLA, and short log retention.
- Environment variables to check in Production: `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a verified domain, not resend.dev), `OPS_ALERT_WEBHOOK_URL`, `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_PRIVACY_CONTACT`, and the AI settings if used.

## Supabase
- Run each new file in `supabase/migrations/` on staging first, then on production, in order, before the code that needs it is deployed. `supabase/test/check-sql.sh` already rebuilds a scratch database from every migration in CI.
- Plan with daily backups (Pro) or point-in-time recovery; practise one restore. Report PDFs can be regenerated; the database cannot.
- Authentication settings: minimum password length, leaked-password protection, MFA for administrators, and a custom SMTP sender.

## Monitoring
- Point an uptime monitor at `/api/health` (expects 200).
- Set `OPS_ALERT_WEBHOOK_URL` to a Slack or Discord webhook to be told about server errors.

## Google Play
- Privacy policy URL: `https://<your-domain>/privacy`. Complete the Data Safety form to match it (children's names, answers and scores; speech recognised on the device; optional AI summaries).
- If the app is a Trusted Web Activity, host `/.well-known/assetlinks.json` with the app's package name and signing fingerprint so it opens full screen.
