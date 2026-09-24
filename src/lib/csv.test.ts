import { describe, expect, it } from "vitest";
import { csvEscape, toCsvRow } from "./csv";

describe("csvEscape", () => {
  it("leaves plain values unquoted", () => {
    expect(csvEscape("Amara")).toBe("Amara");
  });

  it("quotes and doubles embedded quotes", () => {
    expect(csvEscape('Say "hi"')).toBe('"Say ""hi"""');
  });

  it("quotes values containing a comma", () => {
    expect(csvEscape("Doe, Jane")).toBe('"Doe, Jane"');
  });

  it("quotes values containing a newline", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsvRow", () => {
  it("joins fields with commas, escaping as needed", () => {
    expect(toCsvRow(["Amara", 1, "Diaz, T."])).toBe('Amara,1,"Diaz, T."');
  });
});
