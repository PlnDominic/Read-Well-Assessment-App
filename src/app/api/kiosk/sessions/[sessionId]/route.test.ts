import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AssessmentItem } from "@/lib/database.types";

/**
 * The game's answer endpoint: which answers it records, and what it tells
 * the child. The database is a recording stand-in; the scoring rules
 * (evaluateResponse, itemGivesFeedback) are the real ones.
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

function session(showFeedback: boolean, answered: string[] = []) {
  return {
    session: { id: "s1", status: "in_progress", current_item_index: 0 },
    assessment: { level: 1, form: "A", version: 1, show_feedback: showFeedback },
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

describe("with feedback on", () => {
  it("records and scores the first answer, and says whether it was right", async () => {
    loaded = session(true);
    const { status, body } = await answer("LS01", "b");
    expect(status).toBe(200);
    expect(upserts).toEqual([{ session_id: "s1", item_id: "LS01", answer: "b", is_correct: false }]);
    expect(body).toMatchObject({ feedback: true, isCorrect: false, recorded: true });
  });

  it("checks a retry without recording it, and names the right answer after a wrong one", async () => {
    loaded = session(true, ["LS01"]);
    const wrong = await answer("LS01", "c");
    expect(upserts).toEqual([]);
    expect(wrong.body).toMatchObject({ feedback: true, isCorrect: false, recorded: false, correctOption: "a" });

    const right = await answer("LS01", "a");
    expect(upserts).toEqual([]);
    expect(right.body).toMatchObject({ isCorrect: true, recorded: false, correctOption: null });
  });

  it("never gives feedback on a reading-attitude question, and keeps the latest answer", async () => {
    loaded = session(true, ["AT01"]);
    const { body } = await answer("AT01", "c");
    expect(upserts).toHaveLength(1);
    expect(body).toMatchObject({ feedback: false, recorded: true });
    expect(body).not.toHaveProperty("isCorrect");
  });
});

describe("with feedback switched off", () => {
  it("tells the child nothing about right or wrong", async () => {
    loaded = session(false);
    const { body } = await answer("LS01", "b");
    expect(upserts).toHaveLength(1);
    expect(body).toMatchObject({ feedback: false, recorded: true });
    expect(body).not.toHaveProperty("isCorrect");
    expect(body).not.toHaveProperty("correctOption");
  });

  it("scores the last pick, as before feedback existed", async () => {
    loaded = session(false, ["LS01"]);
    await answer("LS01", "a");
    expect(upserts).toEqual([{ session_id: "s1", item_id: "LS01", answer: "a", is_correct: true }]);
  });
});
