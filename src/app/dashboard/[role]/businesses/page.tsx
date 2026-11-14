import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MyBusinessesView, StaffBusinessesView } from "@/components/business/BusinessViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";
import { isRoleId } from "@/lib/roles";

async function Body({ params, searchParams }: PageProps<"/dashboard/[role]/businesses">) {
  const { role } = await params;
  if (!isRoleId(role)) notFound();
  if (role === "applicant") {
    await requireRole("applicant");
    return <MyBusinessesView searchParams={searchParams} />;
  }
  if (role === "bplo" || role === "admin") {
    await requireRole(role);
    return <StaffBusinessesView roleId={role} searchParams={searchParams} />;
  }
  notFound();
}

export default function BusinessesPage(props: PageProps<"/dashboard/[role]/businesses">) {
  return (
    <>
      <title>Business profiles | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
