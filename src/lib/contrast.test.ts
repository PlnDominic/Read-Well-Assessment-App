import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG 2.1 AA contrast for the colour pairings the app is built from, read
 * straight from globals.css so a palette change that breaks one fails here
 * (scripts/a11y-audit.mjs checks the rendered pages the same way with axe).
 */
const css = readFileSync(path.resolve(import.meta.dirname, "../app/globals.css"), "utf8");

/** The `--color-*: #hex` declarations inside the first `{...}` that follows `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`No ${selector} block`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const light = tokens(":root {");
const dark = { ...tokens('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {'), };
const darkExplicit = tokens(':root[data-theme="dark"]');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text token, background token]: every pairing text is actually set in.
const PAIRS: [string, string][] = [
  ["ink", "bg"], ["ink", "surface"], ["ink-soft", "surface"], ["body", "surface"], ["body", "bg"],
  ["muted", "surface"], ["muted", "bg"], ["muted", "neutral"], ["muted-light", "surface"],
  ["ink", "neutral"], ["ink", "orange-tint"],
  ["orange-dark", "surface"], ["orange-dark", "bg"], ["orange-dark", "orange-tint"], ["orange-dark", "neutral"],
  ["orange", "surface"], ["orange", "bg"],
  ["on-orange", "orange"],
];

describe.each([["light", light], ["dark (OS setting)", dark], ["dark (chosen)", { ...light, ...darkExplicit }]] as const)("%s palette", (_name, palette) => {
  it.each(PAIRS)("%s text on %s clears 4.5:1", (text, background) => {
    expect(palette[text], `--color-${text}`).toBeTruthy();
    expect(palette[background], `--color-${background}`).toBeTruthy();
    expect(contrast(palette[text], palette[background]), `${palette[text]} on ${palette[background]}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dark mode", () => {
  it("is declared the same whether the OS or the toggle asks for it", () => {
    for (const key of Object.keys(darkExplicit)) expect(dark[key], key).toBe(darkExplicit[key]);
  });
});

describe("the game's part colours (white text on each)", () => {
  it("all clear 4.5:1", async () => {
    const { LEVEL_PARTS } = await import("./gameParts");
    for (const part of Object.values(LEVEL_PARTS).flat()) {
      expect(contrast("#ffffff", part.color), `${part.code} ${part.color}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
