import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MyApplicationsView } from "@/components/applications/ApplicationViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";

async function Body({ params, searchParams }: PageProps<"/dashboard/[role]/applications">) {
  const { role } = await params;
  if (role !== "applicant") notFound();
  await requireRole("applicant");
  return <MyApplicationsView searchParams={searchParams} />;
}

export default function ApplicationsPage(props: PageProps<"/dashboard/[role]/applications">) {
  return (
    <>
      <title>My applications | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
