/** Quotes a CSV field only when it contains a character that would
 * otherwise break the format (RFC 4180), doubling any embedded quotes. */
export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Excel and Google Sheets run a cell starting with one of these as a
 * formula, so a student named `=HYPERLINK(...)` would run when an admin
 * opens the export. A leading apostrophe makes the spreadsheet show the
 * text as typed (OWASP's CSV injection guidance). */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Numbers pass through as-is; only text fields (user-entered names) can
 * carry a formula, and a negative number isn't one. */
export function toCsvRow(fields: (string | number)[]): string {
  return fields.map((f) => csvEscape(typeof f === "string" ? neutralizeFormula(f) : String(f))).join(",");
}

/**
 * Splits one CSV line into fields, honouring double quotes (so a name like
 * "Mensah, Ama" stays one field and "" inside quotes is a quote). Not for
 * fields that contain line breaks; the importer reads one line at a time.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}
