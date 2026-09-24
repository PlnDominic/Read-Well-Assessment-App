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
  "/avatars/student.png",
  "/avatars/teacher.png",
  "/avatars/admin.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
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
  await cache.add(path).catch(() => undefined);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      ...PRECACHE_PAGES.map((p) => savePage(p).catch(() => undefined)),
      ...PRECACHE_ASSETS.map(precacheAsset),
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
  if (url.pathname.startsWith("/_next/static/") || PRECACHE_ASSETS.includes(url.pathname)) {
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
