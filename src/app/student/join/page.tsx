import { AppShell } from "@/components/AppShell";
import { JoinForm } from "./JoinForm";

export default function StudentJoinPage() {
  return (
    <AppShell showTopBar={false}>
      <JoinForm />
    </AppShell>
  );
}
