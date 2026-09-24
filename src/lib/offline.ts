// Browser-side helpers for the service worker's staff cache (public/sw.js).

/** Staff pages contain student data; wipe them so the next person on a
 * shared device can't read them offline. Called on logout and sign-in. */
export async function clearStaffOfflineData(): Promise<void> {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("rw-staff-")).map((k) => caches.delete(k)));
  } catch {
    // Cache Storage unavailable (e.g. insecure context); nothing was saved.
  }
}

/** The dashboard path (/teacher, /admin, /specialist) saved on this device,
 * if a signed-in staff member has used it here since the last sign-in. */
export async function savedStaffHome(): Promise<string | null> {
  try {
    const res = await caches.match("/__staff-home");
    return res ? await res.text() : null;
  } catch {
    return null;
  }
}
