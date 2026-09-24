import { AppShell } from "@/components/AppShell";
import { AdminNav } from "@/components/AdminNav";
import { ROLE_AVATAR } from "@/lib/avatars";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell avatarSrc={ROLE_AVATAR.administrator}>
      <AdminNav />
      {children}
    </AppShell>
  );
}
