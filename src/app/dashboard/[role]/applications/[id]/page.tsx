import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApplicationDetailView } from "@/components/applications/ApplicationViews";
import { first } from "@/components/business/BusinessViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";

async function Body({ params, searchParams }: PageProps<"/dashboard/[role]/applications/[id]">) {
  const { role, id } = await params;
  if (role !== "applicant") notFound();
  await requireRole("applicant");
  const sp = await searchParams;
  return <ApplicationDetailView id={id} saved={first(sp.saved)} />;
}

export default function ApplicationDetailPage(props: PageProps<"/dashboard/[role]/applications/[id]">) {
  return (
    <>
      <title>Application details | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
