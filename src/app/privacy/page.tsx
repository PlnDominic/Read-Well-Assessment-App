import type { Metadata } from "next";
import { CONTACT, H2, LegalPage, OPERATOR } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · Read Well" };
export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Read Well is a reading assessment tool for schools. {OPERATOR} runs it for schools that use it. Your child&apos;s
        school decides to use it and is responsible for choosing which children take part. This page explains, in plain
        words, what the app collects and why.
      </p>

      <H2>What we collect</H2>
      <ul className="list-disc pl-5">
        <li><strong>About a child:</strong> name, class level, which teacher they belong to, and their answers and scores in each assessment. Children do not create accounts, and we do not ask for a child&apos;s photo, address, phone number or email.</li>
        <li><strong>When a child reads aloud:</strong> the device&apos;s speech recognition turns the child&apos;s voice into text so the app can check the word. We store the text that was heard, not a recording of the child. Speech recognition is provided by the device or browser (for example Google Chrome), which may send the audio to its own speech service under its own privacy policy.</li>
        <li><strong>About staff:</strong> name, email, role, school, and a record of important actions (for example who exported a report).</li>
        <li><strong>On the device:</strong> a child&apos;s questions and unsent answers are kept in the device&apos;s storage so the game works without a connection. Staff pages are also kept for offline use and are cleared when staff sign out or in again.</li>
      </ul>

      <H2>Why we collect it</H2>
      <p>
        To place a child at the right reading level, score the assessment, produce a report that tells the teacher what to
        teach next, and show a school how its children are doing. We do not sell data, show advertising, or use a child&apos;s
        data to profile them for any other purpose.
      </p>

      <H2>AI-written summaries</H2>
      <p>
        If your school switches it on, a teacher can ask for a short written summary of a child&apos;s results. The scores and
        the questions the child missed are sent to an AI service to write the text. The child&apos;s name is not sent. The
        teacher reads and approves the summary before it appears on a report. This is off unless the school turns it on.
      </p>

      <H2>Who else handles the data</H2>
      <p>
        We use trusted services to run the app: a database and sign-in provider (Supabase), hosting (Vercel), a rate-limit
        store (Upstash), email delivery (Resend), and, only if enabled, an AI provider. They process data for us and are not
        allowed to use it for their own purposes. Data may be stored outside Ghana.
      </p>

      <H2>Who can see it</H2>
      <p>
        A teacher sees their own students. A school administrator sees their whole school. A reading specialist sees only
        the students assigned to them. No one outside the school sees a child&apos;s results unless the school shares a report.
        Staff see only their own school&apos;s data.
      </p>

      <H2>How long we keep it</H2>
      <p>
        A school can choose how many days results are kept; after that, they are deleted automatically. If the school has not
        chosen a period, data is kept until the school asks us to delete it. When a school stops using the app, it can ask for
        everything to be deleted.
      </p>

      <H2>Your rights</H2>
      <p>
        A parent or guardian can ask the school to see, correct or delete their child&apos;s data, or to stop their child
        taking part. Staff can ask for their own data. Write to {CONTACT}, and we will help the school act on the request.
      </p>

      <H2>Keeping it safe</H2>
      <p>
        Data is sent over encrypted connections, access is limited by role and school, reports are private and open only
        through short-lived links, and important actions are logged. No system is perfectly safe; if we learn of a problem
        that affects your data, we will tell the school promptly.
      </p>

      <H2>Changes and questions</H2>
      <p>If this policy changes, the date at the top changes. Questions: {CONTACT}.</p>
    </LegalPage>
  );
}
