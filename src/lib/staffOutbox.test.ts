import { describe, expect, it, vi } from "vitest";
import { FINISH_PREFIX, OPEN_PREFIX, PENDING_PREFIX, readOutbox, syncOutbox } from "@/lib/staffOutbox";

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    keys: () => [...data.keys()],
  };
}
const reply = (status: number) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("the staff outbox", () => {
  it("lists assessments with marks or a finish waiting, and ignores empty ones", () => {
    const store = memoryStore({
      [PENDING_PREFIX + "a"]: JSON.stringify({ x: 1, y: 0 }),
      [PENDING_PREFIX + "b"]: "{}",
      [FINISH_PREFIX + "c"]: "1",
    });
    expect(readOutbox(store)).toEqual([
      { sessionId: "a", marks: 2, finish: false },
      { sessionId: "c", marks: 0, finish: true },
    ]);
  });

  it("sends the marks, then the finish, and clears both", async () => {
    const store = memoryStore({ [PENDING_PREFIX + "a"]: JSON.stringify({ x: 1 }), [FINISH_PREFIX + "a"]: "1" });
    const send = reply(200);
    const result = await syncOutbox(store, send);
    expect(send.mock.calls.map((c: unknown[]) => [c[0], (c[1] as RequestInit).method])).toEqual([
      ["/api/assess/sessions/a", "PATCH"],
      ["/api/assess/sessions/a/complete", "POST"],
    ]);
    expect(result).toEqual({ sent: ["a"], waiting: [], finished: ["a"] });
    expect(store.keys()).toEqual([]);
  });

  it("keeps everything when there is no connection", async () => {
    const store = memoryStore({ [PENDING_PREFIX + "a"]: JSON.stringify({ x: 1 }), [FINISH_PREFIX + "a"]: "1" });
    const result = await syncOutbox(store, (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch);
    expect(result.waiting).toEqual(["a"]);
    expect(store.getItem(PENDING_PREFIX + "a")).not.toBeNull();
    expect(store.getItem(FINISH_PREFIX + "a")).not.toBeNull();
  });

  it("doesn't finish before the marks are saved", async () => {
    const store = memoryStore({ [PENDING_PREFIX + "a"]: JSON.stringify({ x: 1 }), [FINISH_PREFIX + "a"]: "1" });
    const send = reply(401);
    const result = await syncOutbox(store, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.waiting).toEqual(["a"]);
    expect(store.getItem(FINISH_PREFIX + "a")).not.toBeNull();
  });

  it("drops a finish the server will never accept, rather than retrying for ever", async () => {
    const store = memoryStore({ [FINISH_PREFIX + "a"]: "1" });
    await syncOutbox(store, reply(409));
    expect(store.keys()).toEqual([]);
  });

  it("retries a finish after a server error", async () => {
    const store = memoryStore({ [FINISH_PREFIX + "a"]: "1" });
    const result = await syncOutbox(store, reply(500));
    expect(result.waiting).toEqual(["a"]);
    expect(store.getItem(FINISH_PREFIX + "a")).not.toBeNull();
  });

  it("leaves an assessment that's open on screen to its own screen", async () => {
    const now = 1_000_000;
    const store = memoryStore({ [PENDING_PREFIX + "a"]: JSON.stringify({ x: 1 }), [OPEN_PREFIX + "a"]: String(now - 3000) });
    const send = reply(200);
    expect((await syncOutbox(store, send, now)).waiting).toEqual(["a"]);
    expect(send).not.toHaveBeenCalled();
    // Once the screen has gone quiet, the outbox takes over.
    expect((await syncOutbox(store, send, now + 60000)).sent).toEqual(["a"]);
  });
});
