/* Read Well service worker: keeps the app usable without a connection.
 * Registered from src/components/ServiceWorkerRegistrar.tsx as
 * /sw.js?v=<build id>, so every deploy installs a fresh worker and drops the
 * previous build's caches.
 *
 * Two caches:
 * - rw-<v>: public pages (login, student code screen, /offline, assessment
 *   pages). Their HTML carries no staff or student data (assessment pages
 *   are a shell; questions come from /api/kiosk and are kept in localStorage).
 * - rw-staff-<v>: staff pages (roster, reports, admin), which DO contain
 *   student data. Wiped on logout and on every sign-in (src/lib/offline.ts)
 *   so the next person on a shared device can't read them.
 *
 * Pages are saved two ways: when loaded as a full document, and when the page
 * posts {type: "cache-page"} after a client-side navigation (Next.js
 * navigations fetch RSC payloads, not HTML, so this worker never sees them).
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `rw-${VERSION}`;
const STAFF_CACHE = `rw-staff-${VERSION}`;
const STAFF_HOME_KEY = "/__staff-home";
const PRECACHE_PAGES = ["/login", "/student/join", "/offline"];
// Sunny's avatar, the login screen's role avatars, and the PWA manifest's
// icons: plain <img src>s (or, for the manifest itself, the OS's own install
// prompt) the browser fetches on its own, not something cacheAssetsFrom()
// finds by scanning for _next/static references. Precaching them here means
// they're available offline after just one visit, same as everything else.
const PRECACHE_ASSETS = [
  "/sunny.png",
  // Sunny's moods and the game sounds (src/components/AnimatedSunny.tsx,
  // src/lib/gameFx.ts): loaded by JavaScript, so nothing in a page's HTML
  // would lead the worker to them.
  "/sunny/sunny-wave.webp",
  "/sunny/sunny-think.webp",
  "/sunny/sunny-listen.webp",
  "/sunny/sunny-cheer.webp",
  "/sunny/sunny-thumbs.webp",
  "/sunny/sunny-trophy.webp",
  "/sunny/sunny-oops.webp",
  "/sunny/sunny-try.webp",
  "/sunny/sunny-point.webp",
  "/sunny/sunny-face.webp",
  "/sounds/tap.mp3",
  "/sounds/star.mp3",
  "/sounds/mission.mp3",
  "/sounds/quest.mp3",
  "/sounds/oops.mp3",
  "/avatars/student.png",
  "/avatars/teacher.png",
  "/avatars/admin.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
// Picture choices in the student game (src/lib/optionPicture.ts), by file
// name under /pictures/. level1FormAGame.test.ts fails if one is missing.
const PICTURES = [
  "1f309.svg", "1f319.svg", "1f327.svg", "1f333.svg", "1f33f.svg", "1f34c.svg", "1f34d.svg",
  "1f34e.svg", "1f372.svg", "1f373.svg", "1f392.svg", "1f3a9.svg", "1f3ca.svg", "1f3de.svg",
  "1f3e0.svg", "1f408.svg", "1f40f.svg", "1f410.svg", "1f414.svg", "1f415.svg", "1f416.svg",
  "1f41f.svg", "1f436.svg", "1f44b.svg", "1f44d.svg", "1f44e.svg", "1f44f.svg", "1f45c.svg",
  "1f483.svg", "1f4a7.svg", "1f4d6.svg", "1f4e6.svg", "1f51f.svg", "1f578.svg", "1f58c.svg",
  "1f5fa.svg", "1f600.svg", "1f610.svg", "1f622.svg", "1f634.svg", "1f642.svg", "1f645.svg",
  "1f68c.svg", "1f695.svg", "1f697.svg", "1f6aa.svg", "1f6b0.svg", "1f6cf.svg", "1f6d6.svg",
  "1f6e3.svg", "1f945.svg", "1f95b.svg", "1f963.svg", "1f96b.svg", "1f96d.svg", "1f9b5.svg",
  "1f9d1-200d-1f33e.svg", "1f9d1-200d-1f3eb.svg", "1f9d1-200d-2695-fe0f.svg", "1f9e6.svg",
  "1f9f1.svg", "1f9f4.svg", "1f9f9.svg", "1f9fa.svg", "1fa91.svg", "1fa9c.svg", "1fa9f.svg",
  "1faa2.svg", "1faa3.svg", "1faba.svg", "2199.svg", "2600.svg", "2615.svg", "26fa.svg",
  "27a1.svg", "2b05.svg", "2b06.svg", "book-back.svg", "book-front.svg", "book-upside-down.svg",
  "gate.svg", "mop.svg", "roof.svg"
];
// Sunny's recorded voice (src/lib/voice.ts), by file name under /voice/.
// voice.test.ts fails if a clip is missing from this list.
const VOICE_CLIPS = [
  "002670c0b797eb.mp3", "002aa09ff018a4.mp3", "00e29499ebea6d.mp3", "01286c7fb0dc17.mp3",
  "01e81181f12d69.mp3", "023ab265ec3b9e.mp3", "02ee2a0bcdc3cd.mp3", "036a99f78c0f45.mp3",
  "03861b6ff2ac02.mp3", "041983a38179ca.mp3", "0429893bdd15d3.mp3", "047c7e4bede014.mp3",
  "04bbe2e248cc66.mp3", "05041a15316d69.mp3", "05596db1d65809.mp3", "056ffd8618a84c.mp3",
  "05e3ed1111f686.mp3", "0658b64a402e09.mp3", "065f9a89dafdfb.mp3", "071a6d4784e5ce.mp3",
  "078b1a2df3797a.mp3", "079d5fbcfb9e91.mp3", "07e4c44f67a177.mp3", "0826c38476f9fb.mp3",
  "08988e5cefe011.mp3", "0949b87a756ad0.mp3", "0966ac7728165c.mp3", "09f033f093aab1.mp3",
  "0a1d9bf121cda6.mp3", "0a7546d0071685.mp3", "0b3c04c72125a3.mp3", "0c4c98b37494c4.mp3",
  "0d776448d3d2a4.mp3", "0da41b5ffc1074.mp3", "0f7032d9aae35b.mp3", "0fa758e5a76750.mp3",
  "1060ba37869f0f.mp3", "1115126d354ab7.mp3", "12f0acf0c56fb2.mp3", "133502e4091bb4.mp3",
  "13d016d14bb915.mp3", "1412afb8c4b467.mp3", "14c118035c1ed8.mp3", "14ffe2ce41ca88.mp3",
  "154c433de7a411.mp3", "1578f0defdade1.mp3", "1592c84b183480.mp3", "1628aef46a890f.mp3",
  "1660d33ba1f7f8.mp3", "16718b41ae3108.mp3", "171ae52f6e4096.mp3", "17982d0cc23b9c.mp3",
  "17ad420b844056.mp3", "18d67080798e44.mp3", "18db4a22786163.mp3", "190b278b829c8c.mp3",
  "190da225805f1b.mp3", "1921daab5ea5a8.mp3", "194aaf2cf029eb.mp3", "19575d9199d3f8.mp3",
  "197f42bba72ffe.mp3", "1a629172431a62.mp3", "1a93c39ad4ee93.mp3", "1a9e3750d3d660.mp3",
  "1abba644a0a981.mp3", "1bac99b326c7c6.mp3", "1c3da3a2a9146c.mp3", "1cb9b408dcd630.mp3",
  "1d0c1bfc0558c2.mp3", "1d7188d1630fc0.mp3", "1ea056cde63d6b.mp3", "1eb2783d92009b.mp3",
  "1ed815504cc99f.mp3", "1f356c85437e3f.mp3", "1f4879589ed776.mp3", "1f947edf92b2cb.mp3"
];
const STAFF_HOMES = ["/teacher", "/admin", "/specialist"];

function isPublicPage(pathname) {
  return (
    pathname === "/login" ||
    pathname === "/login/forgot" ||
    pathname === "/student/join" ||
    pathname === "/offline" ||
    pathname.startsWith("/student/session/")
  );
}

function isStaffPage(pathname) {
  return (
    STAFF_HOMES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname === "/notifications"
  );
}

function isCacheableResponse(res) {
  return res && res.ok && !res.redirected && res.type === "basic";
}

async function cacheAssetsFrom(html) {
  const cache = await caches.open(CACHE);
  const assets = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) assets.add(m[1]);
  await Promise.all(
    [...assets].map(async (url) => {
      if (!(await cache.match(url))) await cache.add(url).catch(() => undefined);
    })
  );
}

async function rememberStaffHome(pathname) {
  const home = STAFF_HOMES.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!home) return;
  const staff = await caches.open(STAFF_CACHE);
  await staff.put(STAFF_HOME_KEY, new Response(home, { headers: { "content-type": "text/plain" } }));
}

// Fetches a page as a document and stores it plus the scripts/styles it
// needs. Public pages are fetched without cookies so a signed-in visit can't
// store a redirect or personalised copy in the shared cache.
async function savePage(pathWithSearch) {
  const pathname = new URL(pathWithSearch, self.location.origin).pathname;
  const staff = isStaffPage(pathname);
  if (!staff && !isPublicPage(pathname)) return;
  const res = await fetch(pathWithSearch, { credentials: staff ? "same-origin" : "omit", cache: "no-store" });
  if (!isCacheableResponse(res)) return;
  const html = await res.clone().text();
  await (await caches.open(staff ? STAFF_CACHE : CACHE)).put(pathWithSearch, res);
  if (staff) await rememberStaffHome(pathname);
  await cacheAssetsFrom(html);
}

// Avoid refetching a page the client just asked for (effects can fire twice).
const recentlySaved = new Map();

async function precacheAsset(path) {
  const cache = await caches.open(CACHE);
  if (await cache.match(path)) return;
  // Not cache.add(): that would store a sign-in redirect as if it were the file.
  try {
    const res = await fetch(path, { credentials: "omit" });
    if (isCacheableResponse(res)) await cache.put(path, res);
  } catch {
    /* offline during install: it's fetched and cached on first use instead */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      ...PRECACHE_PAGES.map((p) => savePage(p).catch(() => undefined)),
      ...PRECACHE_ASSETS.map(precacheAsset),
      ...PICTURES.map((f) => precacheAsset(`/pictures/${f}`)),
      ...VOICE_CLIPS.map((f) => precacheAsset(`/voice/${f}`)),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("rw-") && k !== CACHE && k !== STAFF_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache-page" || typeof data.path !== "string" || !data.path.startsWith("/")) return;
  const last = recentlySaved.get(data.path) || 0;
  if (Date.now() - last < 30000) return;
  recentlySaved.set(data.path, Date.now());
  event.waitUntil(savePage(data.path).catch(() => undefined));
});

async function offlinePage() {
  return (await caches.match("/offline")) || Response.error();
}

async function staffHomeRedirect() {
  const home = await (await caches.open(STAFF_CACHE)).match(STAFF_HOME_KEY);
  return home ? Response.redirect(await home.text(), 302) : null;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build assets are content-hashed, so a cached copy is always correct.
  // The avatar images don't change without a new deploy either (a new image
  // would get a new filename), so they get the same cache-first treatment.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pictures/") || url.pathname.startsWith("/voice/") || PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (isCacheableResponse(res)) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  if (request.mode !== "navigate") return; // API calls, RSC payloads, etc. go straight to the network.

  const key = url.pathname + url.search;
  const staff = isStaffPage(url.pathname);

  // Network first everywhere, so online users always see live data; the
  // cache is only the fallback when there's no connection.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        if ((staff || isPublicPage(url.pathname)) && isCacheableResponse(res)) {
          const copy = res.clone();
          (await caches.open(staff ? STAFF_CACHE : CACHE)).put(key, copy);
          if (staff) rememberStaffHome(url.pathname);
        }
        return res;
      } catch {
        if (staff || isPublicPage(url.pathname)) {
          const cache = await caches.open(staff ? STAFF_CACHE : CACHE);
          const hit = (await cache.match(key)) || (await cache.match(key, { ignoreSearch: true }));
          if (hit) return hit;
        }
        // "/" normally redirects a signed-in user to their dashboard; offline,
        // send them to the one saved on this device.
        if (url.pathname === "/") return (await staffHomeRedirect()) || (await caches.match("/login")) || offlinePage();
        return offlinePage();
      }
    })()
  );
});
