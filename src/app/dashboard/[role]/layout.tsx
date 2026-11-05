import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ShellLoader, ShellSkeleton } from "@/components/layout/ShellLoader";
import { isRoleId, ROLE_ORDER } from "@/lib/roles";

export function generateStaticParams() {
  return ROLE_ORDER.map((role) => ({ role }));
}

export default async function RoleLayout({ children, params }: LayoutProps<"/dashboard/[role]">) {
  const { role } = await params;
  if (!isRoleId(role)) notFound();
  // Layouts are not re-rendered on in-app navigation, so every page below also
  // calls requireRole(). This layout covers the first load.
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ShellLoader role={role}>{children}</ShellLoader>
    </Suspense>
  );
}
