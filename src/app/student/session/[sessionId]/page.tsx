import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createAdminClient } from "@/lib/supabase/admin";
import { StudentAssessmentRunner } from "./StudentAssessmentRunner";

export default async function StudentSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const admin = createAdminClient();
  const { data: session } = await admin.from("assessment_sessions").select("id").eq("id", sessionId).single();
  if (!session) notFound();

  return (
    <AppShell showTopBar={false}>
      <StudentAssessmentRunner sessionId={sessionId} />
    </AppShell>
  );
}
