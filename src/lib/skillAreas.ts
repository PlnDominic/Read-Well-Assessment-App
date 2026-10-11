/**
 * The key a new skill area is stored under (skill_areas.key), made from its
 * name: game items refer to a skill area by key, so it never changes once
 * made, even if the name does. "Oral language" → "oralLanguage". null if
 * the name has no letters to make one from.
 */
export function skillKeyFromName(name: string): string | null {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!words.some((w) => /[A-Za-z]/.test(w))) return null;
  const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("");
  return /^[a-z]/.test(key) ? key : `skill${key[0].toUpperCase()}${key.slice(1)}`;
}
