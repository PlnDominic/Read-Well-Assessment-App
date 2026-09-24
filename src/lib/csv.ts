/** Quotes a CSV field only when it contains a character that would
 * otherwise break the format (RFC 4180), doubling any embedded quotes. */
export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsvRow(fields: (string | number)[]): string {
  return fields.map((f) => csvEscape(String(f))).join(",");
}
