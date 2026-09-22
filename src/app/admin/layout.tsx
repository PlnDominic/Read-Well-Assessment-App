import { AppShell } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AdminNav />
      {children}
    </AppShell>
  );
}
