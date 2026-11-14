import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApplicantRequirementsView } from "@/components/documents/DocumentViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";

async function Body({ params }: PageProps<"/dashboard/[role]/applications/[id]/requirements">) {
  const { role, id } = await params;
  if (role !== "applicant") notFound();
  await requireRole("applicant");
  return <ApplicantRequirementsView id={id} />;
}

export default function ApplicationRequirementsPage(props: PageProps<"/dashboard/[role]/applications/[id]/requirements">) {
  return (
    <>
      <title>Requirements | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
