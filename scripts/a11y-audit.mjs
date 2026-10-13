#!/usr/bin/env node
/**
 * Runs axe-core (WCAG 2.1 A/AA) over the pages that render without a database,
 * in light and dark mode, on a phone and a desktop screen. The student game is
 * driven through its screens with a made-up session (the kiosk API is
 * answered by the script), so its welcome card, a picture question, a read
 * aloud question, a writing question, the mission-complete card and the
 * "Stop here" break card are all checked.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
 *     SUPABASE_SERVICE_ROLE_KEY=x npm run dev     # (or build + start)
 *   node scripts/a11y-audit.mjs [http://localhost:3000]
 *
 * The script answers the one Supabase lookup the game page makes (does this
 * session exist?) on localhost:54399, so no real project is touched.
 *
 * Needs Chromium: PLAYWRIGHT_BROWSERS_PATH is used as Playwright does, or set
 * CHROMIUM_PATH. Exits 1 if axe finds a violation.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const axeSource = require("node:fs").readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.argv[2] ?? "http://localhost:3000";
const ID = "11111111-1111-4111-8111-111111111111";

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  for (const dir of existsSync(root) ? readdirSync(root) : []) {
    for (const rel of ["chrome-linux/chrome", "chrome"]) {
      const candidate = path.join(root, dir, rel);
      if (existsSync(candidate) && !dir.includes("headless_shell")) return candidate;
    }
  }
  return undefined;
}

// A tiny two-sitting quest: Level 1 part codes so the game builds real missions.
const choice = (id, skillAreaKey, prompt, options) => ({ id, skillAreaKey, type: "choice", prompt, passage: null, say: prompt, options });
const state = {
  status: "not_started",
  currentItemIndex: 0,
  sessionCode: "ABC234",
  studentName: "Ama Mensah",
  assessmentLevel: 1,
  assessmentForm: "A",
  assessmentVersion: 3,
  items: [
    choice("LC01", "storyListening", "What animal does Kwaku have?", ["🐐 A goat", "🐔 A hen", "🐕 A dog"]),
    choice("VO01", "vocabulary", "Tap the ram.", ["🐔", "🐏", "🐕", "🐟"]),
    choice("VO02", "vocabulary", "Tap the web.", ["🥅", "🪢", "🕸️", "🪺"]),
    { id: "CV01", skillAreaKey: "wordReading", type: "mic", prompt: "Slide the sounds together and say it.", passage: "ma", say: "Tap the mic and say it.", options: null },
    { id: "WT01", skillAreaKey: "writing", type: "text", prompt: "Write your name.", passage: null, say: "Write your name.", options: null },
  ],
  answersByItemId: {},
};

// A stand-in for Supabase's REST API: every session lookup finds the made-up session.
const supabase = createServer((req, res) => {
  const single = String(req.headers.accept ?? "").includes("pgrst.object");
  res.writeHead(200, { "content-type": single ? "application/vnd.pgrst.object+json" : "application/json" });
  res.end(JSON.stringify(single ? { id: ID } : [{ id: ID }]));
}).listen(54399);

const results = [];
async function audit(page, label) {
  await page.evaluate(axeSource);
  const { violations } = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  results.push({ label, violations });
  console.log(`${violations.length ? "✗" : "✓"} ${label}${violations.length ? ` (${violations.length})` : ""}`);
  for (const v of violations) {
    console.log(`    ${v.id} [${v.impact}]: ${v.help}`);
    for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.target.join(" ")}  ${n.any[0]?.message ?? n.failureSummary?.split("\n")[1] ?? ""}`);
  }
}

// Keyboard check (WCAG 2.4.7): Tab through the page and flag any control that shows no focus ring.
async function auditFocus(page, label) {
  const problems = [];
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const css = getComputedStyle(el);
      const ring = (parseFloat(css.outlineWidth) > 0 && css.outlineStyle !== "none") || css.boxShadow !== "none";
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 30);
      return { ring, name, tag: el.tagName.toLowerCase(), path: el.id || el.className?.toString().split(" ")[0] || "" };
    });
    if (info === null) break;
    if (info.tag.startsWith("nextjs-")) continue; // the dev server's own overlay
    if (!info.ring && !problems.some((p) => p.name === info.name)) problems.push(info);
  }
  results.push({ label: `${label} (keyboard focus)`, violations: problems.map((p) => ({ id: "focus-visible", impact: "serious", help: `No visible focus ring on ${p.tag} "${p.name}"`, nodes: [] })) });
  console.log(`${problems.length ? "✗" : "✓"} ${label} (keyboard focus)${problems.length ? ` (${problems.length})` : ""}`);
  for (const p of problems) console.log(`    no focus ring: <${p.tag}> "${p.name}" ${p.path}`);
}

const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
for (const scheme of ["light", "dark"]) {
  for (const [device, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
    const context = await browser.newContext({ colorScheme: scheme, viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.route(`**/api/kiosk/sessions/${ID}`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: state })
        : route.fulfill({ json: { ok: true, currentItemIndex: 1 } }));
    await page.route(`**/api/kiosk/sessions/${ID}/complete`, (route) => route.fulfill({ json: { ok: true } }));
    const tag = `${scheme} ${device}`;

    for (const url of ["/login", "/student/join", "/offline"]) {
      await page.goto(BASE + url, { waitUntil: "networkidle" });
      await audit(page, `${tag}: ${url}`);
      if (device === "desktop") await auditFocus(page, `${tag}: ${url}`);
    }

    await page.goto(`${BASE}/student/session/${ID}`, { waitUntil: "networkidle" });
    await audit(page, `${tag}: game welcome`);
    if (device === "desktop") await auditFocus(page, `${tag}: game welcome`);
    await page.getByRole("button", { name: /let.s start/i }).click();
    // A tapped choice moves on by itself after a moment; wait for that.
    await page.getByRole("button", { name: /A goat/ }).click();
    await page.getByText("Tap the ram.").waitFor();
    await audit(page, `${tag}: game picture question`);
    await page.getByRole("button", { name: "Choice 2" }).click();
    await page.getByText("Tap the web.").waitFor();
    await page.getByRole("button", { name: "Choice 3" }).click();
    await page.locator(".rw-celebrate-card").waitFor();
    await audit(page, `${tag}: game stop-here break card`);
    await page.locator(".rw-celebrate-card .rw-primary").click();
    await page.getByText("Slide the sounds together").waitFor();
    await audit(page, `${tag}: game read-aloud question`);
    await page.getByRole("button", { name: /can.t read this one yet/i }).click();
    await page.locator(".rw-actions .rw-primary").click();
    await page.locator(".rw-celebrate-card").waitFor();
    await audit(page, `${tag}: game mission complete`);
    await page.locator(".rw-celebrate-card .rw-primary").click();
    await page.getByText("Write your name.").first().waitFor();
    await page.locator("textarea").fill("Ama");
    await audit(page, `${tag}: game writing question`);
    await context.close();
  }
}
await browser.close();
supabase.close();

const failed = results.filter((r) => r.violations.length);
console.log(`\n${results.length - failed.length} of ${results.length} screens clean.`);
process.exit(failed.length ? 1 : 0);
