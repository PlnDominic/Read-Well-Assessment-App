import { describe, expect, it, vi } from "vitest";
import { draftFamilyNote, type CallModel } from "@/lib/aiSummaryServer";
import { fillFamilyName, familyNoteMessage, familyNotePrompt, hideName, isFamilyLanguage, parseFamilyNote } from "@/lib/familyNote";
import type { SummaryContent } from "@/lib/aiSummary";

const summary: SummaryContent = {
  headline: "Ama is ready to begin Level 1.",
  overview: "Ama Mensah names most letters. AMA is still learning letter sounds, and Amazing Grace stories help.",
  canDo: ["Name 18 letters"],
  notYet: ["The sounds of b and d"],
  firstThings: [{ title: "Letter sounds", text: "Two new sounds a week for Ama." }],
  atSchool: ["Teach two new letter sounds each week."],
  atHome: [{ title: "I spy", text: "Play I spy with first sounds." }],
};

describe("hideName", () => {
  it("takes out the full name and each part of it, in any case, as whole words", () => {
    expect(hideName(summary.overview, "Ama Mensah")).toBe(
      "{{name}} names most letters. {{name}} is still learning letter sounds, and Amazing Grace stories help."
    );
  });

  it("leaves text without the name alone", () => {
    expect(hideName("Play I spy with first sounds.", "Kofi Boateng")).toBe("Play I spy with first sounds.");
  });

  it("copes with names that have letters regular expressions treat specially", () => {
    expect(hideName("Well done, Abena-Mae (Abena)!", "Abena-Mae")).toBe("Well done, {{name}} (Abena)!");
  });
});

describe("familyNoteMessage", () => {
  it("sends the summary without the child's name, and nothing the note isn't made from", () => {
    const message = familyNoteMessage(summary, "Ama Mensah");
    expect(message).not.toMatch(/\bAma\b|Mensah/i);
    expect(message).toContain("{{name}}");
    expect(message).toContain("I spy");
    expect(message).not.toContain("Teach two new letter sounds");
  });
});

describe("familyNotePrompt", () => {
  it("names the language and its letters, and keeps the name token", () => {
    expect(familyNotePrompt("tw")).toMatch(/Twi.*ɛ and ɔ/);
    expect(familyNotePrompt("ee")).toMatch(/Ewe.*ɖ, ƒ, ɣ, ŋ, ʋ/);
    expect(familyNotePrompt("gaa")).toContain("{{name}}");
  });
});

describe("parseFamilyNote", () => {
  const note = { language: "tw", text: "Akwaaba! {{name}} reyɛ adeɛ pa.", atHome: [{ title: "Agorɔ", text: "Monni agorɔ yi." }] };

  it("accepts a note in one of the three languages", () => {
    expect(parseFamilyNote(note)).toEqual(note);
    expect(isFamilyLanguage("gaa")).toBe(true);
  });

  it("rejects another language, an empty note, or an activity without a title", () => {
    expect(parseFamilyNote({ ...note, language: "fr" })).toBeNull();
    expect(isFamilyLanguage("toString")).toBe(false);
    expect(parseFamilyNote({ ...note, text: "  " })).toBeNull();
    expect(parseFamilyNote({ ...note, atHome: [] })).toBeNull();
    expect(parseFamilyNote({ ...note, atHome: [{ title: "", text: "x" }] })).toBeNull();
  });

  it("puts the first name back", () => {
    expect(fillFamilyName(parseFamilyNote(note)!, "Ama").text).toBe("Akwaaba! Ama reyɛ adeɛ pa.");
  });
});

describe("draftFamilyNote", () => {
  it("asks in the family note's shape and returns it in the chosen language", async () => {
    const call = vi.fn<CallModel>(async () => ({
      text: JSON.stringify({ text: "Mia dzidzɔ! {{name}} le nu srɔ̃m nyuie.", atHome: [{ title: "Fefe", text: "Mi fe fefe sia." }] }),
      stopReason: "end_turn",
      model: "m",
    }));
    const { content } = await draftFamilyNote(summary, "Ama Mensah", "ee", call, "m", 1);
    expect(content.language).toBe("ee");
    expect(content.text).toContain("{{name}}");
    const [system, user, , format] = call.mock.calls[0];
    expect(system).toContain("Ewe");
    expect(user).not.toMatch(/Mensah/);
    expect(format.instruction).toContain('"atHome"');
  });

  it("rejects an answer that doesn't fit", async () => {
    const call: CallModel = async () => ({ text: JSON.stringify({ text: "only text" }), stopReason: "end_turn", model: "m" });
    await expect(draftFamilyNote(summary, "Ama", "tw", call, "m", 1)).rejects.toThrow(/wrong shape/);
  });
});
