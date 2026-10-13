/**
 * The staff device's outbox: what an assessor has done on this device that
 * the server hasn't heard yet. The assessor screen keeps every mark in
 * localStorage until it's saved, and a finished assessment waits here for
 * a connection too. This module sends both on its own whenever the device is
 * online, from any staff page, so a teacher can finish a child offline, walk
 * back into signal and carry on, without reopening the assessment.
 *
 * Keys are shared with the assessor screen
 * (src/app/teacher/assess/[sessionId]/AssessorRunner.tsx).
 */

export const PENDING_PREFIX = "rw:assess:pending:";
export const FINISH_PREFIX = "rw:assess:finish:";
export const SCREEN_PREFIX = "rw:assess:screen:";
/** The assessor screen stamps this while it's open, and does its own syncing meanwhile. */
export const OPEN_PREFIX = "rw:assess:open:";
/** How long a stamp counts as "still open"; the screen refreshes it every few seconds. */
export const OPEN_FRESH_MS = 20000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export interface OutboxEntry {
  sessionId: string;
  /** Marks waiting to be saved. */
  marks: number;
  /** The assessor tapped "Finish and score" while offline. */
  finish: boolean;
}

function idsWith(store: Store, prefix: string): string[] {
  const ids: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(prefix)) ids.push(key.slice(prefix.length));
  }
  return ids;
}

function marksIn(store: Store, sessionId: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(store.getItem(PENDING_PREFIX + sessionId) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Everything waiting to be sent, one entry per assessment. */
export function readOutbox(store: Store): OutboxEntry[] {
  const ids = new Set([...idsWith(store, PENDING_PREFIX), ...idsWith(store, FINISH_PREFIX)]);
  return [...ids]
    .map((sessionId) => ({
      sessionId,
      marks: Object.keys(marksIn(store, sessionId)).length,
      finish: store.getItem(FINISH_PREFIX + sessionId) !== null,
    }))
    .filter((entry) => entry.marks > 0 || entry.finish);
}

function isOpen(store: Store, sessionId: string, now: number): boolean {
  const stamp = Number(store.getItem(OPEN_PREFIX + sessionId));
  return Number.isFinite(stamp) && now - stamp < OPEN_FRESH_MS;
}

export interface SyncResult {
  /** Assessments whose marks (and finish, if queued) the server now has. */
  sent: string[];
  /** Assessments still waiting: no connection, or the server refused for now. */
  waiting: string[];
  /** Assessments that were finished and scored by this pass. */
  finished: string[];
}

/**
 * Sends the outbox. An assessment open on screen is left to its own screen.
 * A finish the server will never accept (the assessment is gone, isn't the
 * teacher's, or has parts still unmarked) is dropped from the outbox rather
 * than retried for ever: the teacher finds it unfinished on the class list.
 */
export async function syncOutbox(store: Store, send: typeof fetch, now = Date.now()): Promise<SyncResult> {
  const result: SyncResult = { sent: [], waiting: [], finished: [] };
  for (const entry of readOutbox(store)) {
    const { sessionId } = entry;
    if (isOpen(store, sessionId, now)) {
      result.waiting.push(sessionId);
      continue;
    }
    try {
      const marks = marksIn(store, sessionId);
      if (Object.keys(marks).length > 0) {
        const res = await send(`/api/assess/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marks }),
        });
        if (!res.ok) {
          // The server refused these marks (not signed in, or the assessment is gone): keep them for the screen to show.
          result.waiting.push(sessionId);
          continue;
        }
        // Drop only what was sent, in case a mark was made while it was in flight.
        const remaining = marksIn(store, sessionId);
        for (const [id, value] of Object.entries(marks)) if (JSON.stringify(remaining[id]) === JSON.stringify(value)) delete remaining[id];
        if (Object.keys(remaining).length === 0) store.removeItem(PENDING_PREFIX + sessionId);
        else store.setItem(PENDING_PREFIX + sessionId, JSON.stringify(remaining));
      }
      if (entry.finish && store.getItem(PENDING_PREFIX + sessionId) === null) {
        const res = await send(`/api/assess/sessions/${sessionId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.ok) {
          result.finished.push(sessionId);
        } else if (res.status >= 500 || res.status === 401) {
          result.waiting.push(sessionId);
          continue;
        }
        // Finished, or refused for good (403, 404, 409): either way, stop retrying.
        store.removeItem(FINISH_PREFIX + sessionId);
        store.removeItem(SCREEN_PREFIX + sessionId);
      }
      if (store.getItem(FINISH_PREFIX + sessionId) !== null) result.waiting.push(sessionId);
      else result.sent.push(sessionId);
    } catch {
      result.waiting.push(sessionId);
    }
  }
  return result;
}
