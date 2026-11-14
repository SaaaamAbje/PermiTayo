import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApplicationFormLoader } from "@/components/applications/ApplicationFormLoader";
import { first } from "@/components/business/BusinessViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";

async function Body({ params, searchParams }: PageProps<"/dashboard/[role]/new-application">) {
  const { role } = await params;
  if (role !== "applicant") notFound();
  await requireRole("applicant");
  const sp = await searchParams;
  return <ApplicationFormLoader preselectBusinessId={first(sp.business)} />;
}

export default function NewApplicationPage(props: PageProps<"/dashboard/[role]/new-application">) {
  return (
    <>
      <title>New application | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
