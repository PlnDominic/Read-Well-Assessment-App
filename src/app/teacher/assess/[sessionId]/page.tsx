import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ROLE_AVATAR } from "@/lib/avatars";
import { gradeLabel } from "@/lib/grades";
import { loadAssessorSession, requireAssessor } from "@/lib/readwell/assessorSession";
import { AssessorRunner } from "./AssessorRunner";

/**
 * The assessor screen for assessor-led forms (ReadWell Level 1, KG 1): a
 * trained adult sits beside the child, who reads from the printed
 * stimulus book, and taps right or wrong for each item here. The device
 * replaces the score sheet and the stopwatch, not the assessor.
 */
export default async function AssessSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const assessor = await requireAssessor();
  if (!assessor) redirect("/teacher");

  const session = await loadAssessorSession(assessor.supabase, sessionId);
  if (!session) notFound();
  if (session.status === "completed") redirect(`/teacher/students/${session.studentId}/report?session=${session.id}`);

  return (
    <AppShell avatarSrc={ROLE_AVATAR[assessor.profile.role]}>
      <AssessorRunner
        sessionId={session.id}
        studentId={session.studentId}
        studentName={session.studentName}
        gradeText={gradeLabel(session.studentGrade)}
        items={session.items}
        initialAnswers={session.answers}
      />
    </AppShell>
  );
}
