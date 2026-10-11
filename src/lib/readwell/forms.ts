import type { AssessmentItem } from "@/lib/database.types";
import type { FormDef } from "./form";
import { LEVEL1_FORM_A } from "./level1FormA";

/**
 * Every assessor-led form the app knows how to give, by item code prefix:
 * L{level}{A|B|C|F}, F being the Final assessment (L1A is Level 1 Form A).
 * Each new guide becomes a module like level1FormA.ts, listed here, plus
 * the SQL that seeds its items.
 */
const FORMS: FormDef[] = [LEVEL1_FORM_A];

/**
 * The form a stored assessment belongs to, with its items taken from the
 * stored copy (assessments.items) rather than the code: a session is
 * always scored against the exact items it was given. null for kiosk
 * assessments or an unknown form.
 */
export function formForItems(items: AssessmentItem[]): FormDef | null {
  const prefix = items[0]?.id.split(".")[0];
  const form = FORMS.find((f) => f.id === prefix);
  return form ? { ...form, items } : null;
}
