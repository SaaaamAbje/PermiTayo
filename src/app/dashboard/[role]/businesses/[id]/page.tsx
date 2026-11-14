import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BusinessDetailView, first } from "@/components/business/BusinessViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";

async function Body({ params, searchParams }: PageProps<"/dashboard/[role]/businesses/[id]">) {
  const { role, id } = await params;
  if (role !== "applicant" && role !== "bplo" && role !== "admin") notFound();
  await requireRole(role);
  const sp = await searchParams;
  return <BusinessDetailView id={id} roleId={role} saved={first(sp.saved)} />;
}

export default function BusinessDetailPage(props: PageProps<"/dashboard/[role]/businesses/[id]">) {
  return (
    <>
      <title>Business profile | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
