import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AssessmentItem } from "@/lib/database.types";

/**
 * The game's answer endpoint: which answers it records, and that it never
 * tells the child's device whether one was right. The database is a
 * recording stand-in; the scoring rule (evaluateResponse) is the real one.
 */

const upserts: { item_id: string; answer: unknown; is_correct: boolean }[] = [];
let loaded: Awaited<ReturnType<typeof import("@/lib/kiosk").loadSessionForKiosk>>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: async (row: { item_id: string; answer: unknown; is_correct: boolean }) => {
        upserts.push(row);
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

vi.mock("@/lib/kiosk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kiosk")>()),
  loadSessionForKiosk: async () => loaded,
}));

const { PATCH } = await import("./route");

const choice = (id: string, skillAreaKey = "letterSounds"): AssessmentItem => ({
  id,
  skillAreaKey,
  type: "choice",
  prompt: "Which one?",
  options: [
    { text: "a", isCorrect: true },
    { text: "b", isCorrect: false },
    { text: "c", isCorrect: false },
  ],
});

const ITEMS = [choice("LS01"), choice("AT01", "readingAttitude")];

function session(answered: string[] = []) {
  return {
    session: { id: "s1", status: "in_progress", current_item_index: 0 },
    assessment: { level: 1, form: "A", version: 1 },
    items: ITEMS,
    responses: answered.map((item_id) => ({ item_id, answer: "x" })),
    studentName: "Kofi",
    assessorLed: false,
  } as unknown as typeof loaded;
}

async function answer(itemId: string, value: string) {
  const req = new NextRequest("http://localhost/api/kiosk/sessions/s1", {
    method: "PATCH",
    body: JSON.stringify({ itemId, answer: value }),
  });
  const res = await PATCH(req, { params: Promise.resolve({ sessionId: "s1" }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  upserts.length = 0;
});

describe("answering", () => {
  it("records and scores the answer", async () => {
    loaded = session();
    const { status } = await answer("LS01", "b");
    expect(status).toBe(200);
    expect(upserts).toEqual([{ session_id: "s1", item_id: "LS01", answer: "b", is_correct: false }]);
  });

  it("scores the latest pick when the child changes their mind", async () => {
    loaded = session(["LS01"]);
    await answer("LS01", "a");
    expect(upserts).toEqual([{ session_id: "s1", item_id: "LS01", answer: "a", is_correct: true }]);
  });

  it("never tells the child's device whether the answer was right, or which one was", async () => {
    loaded = session();
    for (const pick of ["a", "b"]) {
      const { body } = await answer("LS01", pick);
      expect(body).toEqual({ ok: true, currentItemIndex: 1 });
    }
  });

  it("moves a child on from a part they plainly can't do yet, without saying why", async () => {
    const run = ["LN01", "LN02", "LN03", "LN04", "LN05"].map((id) => choice(id, "letterNames"));
    loaded = {
      ...session(),
      session: { id: "s1", status: "in_progress", current_item_index: 2 },
      items: [...run, choice("LS01")],
      responses: [{ item_id: "LN01", answer: "b", is_correct: false }, { item_id: "LN02", answer: "b", is_correct: false }],
    } as unknown as typeof loaded;
    const { body } = await answer("LN03", "b");
    expect(body).toEqual({ ok: true, currentItemIndex: 5, skipTo: 5 });
    // A right answer keeps the child in the part, and the reply is the usual one.
    const { body: carryOn } = await answer("LN03", "a");
    expect(carryOn).toEqual({ ok: true, currentItemIndex: 3 });
  });

  it("records reading-attitude answers the same way", async () => {
    loaded = session(["AT01"]);
    const { body } = await answer("AT01", "c");
    expect(upserts).toHaveLength(1);
    expect(body).not.toHaveProperty("isCorrect");
  });
});
