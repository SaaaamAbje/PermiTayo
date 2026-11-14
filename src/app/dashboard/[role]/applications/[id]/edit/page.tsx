import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApplicationFormLoader } from "@/components/applications/ApplicationFormLoader";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";
import { isUuid } from "@/lib/business/queries";

async function Body({ params }: PageProps<"/dashboard/[role]/applications/[id]/edit">) {
  const { role, id } = await params;
  if (role !== "applicant" || !isUuid(id)) notFound();
  await requireRole("applicant");
  return <ApplicationFormLoader applicationId={id} />;
}

export default function EditApplicationPage(props: PageProps<"/dashboard/[role]/applications/[id]/edit">) {
  return (
    <>
      <title>Edit draft application | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
