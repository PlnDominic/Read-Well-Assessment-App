/* Read Well service worker: lets the student-facing app open without a
 * connection. Registered from src/components/ServiceWorkerRegistrar.tsx as
 * /sw.js?v=<build id>, so every deploy installs a fresh worker and drops the
 * previous build's cache.
 *
 * Only pages whose HTML carries no staff or student data are cached, because
 * kiosk devices are shared: the login screen, the student code screen, the
 * offline page, and individual assessment pages (their HTML is just a shell;
 * the questions come from /api/kiosk and are cached by the page itself in
 * localStorage). Staff pages are never cached; offline they get /offline.
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `rw-${VERSION}`;
const PRECACHE_PAGES = ["/login", "/student/join", "/offline"];

function isCacheablePage(pathname) {
  return (
    pathname === "/login" ||
    pathname === "/login/forgot" ||
    pathname === "/student/join" ||
    pathname === "/offline" ||
    pathname.startsWith("/student/session/")
  );
}

function isCacheableResponse(res) {
  return res && res.ok && !res.redirected && res.type === "basic";
}

async function cachePageAndAssets(cache, path) {
  // credentials: "omit" so a signed-in staff member's visit can't store a
  // redirect (or their session) in place of the public page.
  const res = await fetch(path, { credentials: "omit", cache: "reload" });
  if (!isCacheableResponse(res)) return;
  const html = await res.clone().text();
  await cache.put(path, res);
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) assets.add(match[1]);
  await Promise.all(
    [...assets].map((url) => cache.add(url).catch(() => undefined))
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(PRECACHE_PAGES.map((p) => cachePageAndAssets(cache, p).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rw-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build assets are content-hashed, so a cached copy is always correct.
  if (url.pathname.startsWith("/_next/static/")) {
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

  if (isCacheablePage(url.pathname)) {
    // Network first so online users always get the latest page; the cache
    // is only the fallback for when there's no connection.
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const res = await fetch(request);
          if (isCacheableResponse(res)) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (
            (await cache.match(url.pathname)) ||
            (await cache.match("/offline")) ||
            Response.error()
          );
        }
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => (await caches.match("/offline")) || Response.error())
  );
});
