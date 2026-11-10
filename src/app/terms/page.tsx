import type { Metadata } from "next";
import { CONTACT, H2, LegalPage, OPERATOR } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use · Read Well" };
export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>
        These terms cover use of Read Well, provided by {OPERATOR} to schools. By signing in or using a code, you agree to
        them. If you use the app for a school, you confirm you are allowed to.
      </p>

      <H2>Who may use it</H2>
      <p>
        Staff sign in with an account the school&apos;s administrator created, and keep their password private. Children use
        a code their teacher gives them, with a teacher or parent nearby where possible. Do not share a child&apos;s code with
        anyone else.
      </p>

      <H2>What the app is for</H2>
      <p>
        Read Well helps teachers see where a child is in learning to read. Its scores and written summaries are a guide, not a
        diagnosis, and a teacher&apos;s own judgement comes first. AI-written text can make mistakes, which is why a teacher
        checks it. The scores and bands in a report are the record.
      </p>

      <H2>Using it properly</H2>
      <ul className="list-disc pl-5">
        <li>Use it only for teaching and assessing reading, and only for children your school has chosen.</li>
        <li>Do not try to get into data that is not yours, test the app&apos;s security without written permission, or overload it.</li>
        <li>Do not enter information that is not needed, such as health details.</li>
      </ul>

      <H2>Your school&apos;s data</H2>
      <p>
        The school owns the data it enters and the results it creates. {OPERATOR} uses it only to run the app for the school,
        as described in the <a href="/privacy" className="text-[var(--color-orange-dark)] underline">privacy policy</a>.
      </p>

      <H2>Availability</H2>
      <p>
        We work to keep the app running and the game usable offline, but we cannot promise it will never be down. Save and
        sync happen when a device has a connection.
      </p>

      <H2>Changes and contact</H2>
      <p>We may update these terms; the date at the top shows when. Questions: {CONTACT}.</p>
    </LegalPage>
  );
}
