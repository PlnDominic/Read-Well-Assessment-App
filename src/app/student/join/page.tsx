import { AppShell } from "@/components/AppShell";
import { JoinForm } from "./JoinForm";
import { StudentOnboarding } from "./StudentOnboarding";

export default function StudentJoinPage() {
  return (
    <AppShell showTopBar={false}>
      <JoinForm />
      <StudentOnboarding />
    </AppShell>
  );
}
