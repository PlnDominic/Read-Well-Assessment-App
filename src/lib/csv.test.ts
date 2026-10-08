import { describe, expect, it } from "vitest";
import { csvEscape, neutralizeFormula, toCsvRow } from "./csv";

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

describe("neutralizeFormula", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])("prefixes %j so it isn't run as a formula", (v) => {
    expect(neutralizeFormula(v)).toBe(`'${v}`);
  });

  it("leaves ordinary text alone, including a formula character later in the value", () => {
    expect(neutralizeFormula("Mary-Kate")).toBe("Mary-Kate");
  });
});

describe("toCsvRow", () => {
  it("joins fields with commas, escaping as needed", () => {
    expect(toCsvRow(["Amara", 1, "Diaz, T."])).toBe('Amara,1,"Diaz, T."');
  });

  it("neutralizes a formula in a text field, then quotes it if needed", () => {
    expect(toCsvRow(['=HYPERLINK("http://x","y")', 1])).toBe(`"'=HYPERLINK(""http://x"",""y"")",1`);
  });

  it("leaves negative numbers as numbers", () => {
    expect(toCsvRow(["Amara", -5])).toBe("Amara,-5");
  });
});
