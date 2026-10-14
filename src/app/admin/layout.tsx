import { StaffShell } from "@/components/StaffShell";

/** Every admin page: the navigation down the left, the page on the right. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <StaffShell role="administrator">{children}</StaffShell>;
}
