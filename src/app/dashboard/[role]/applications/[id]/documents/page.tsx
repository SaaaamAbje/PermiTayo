import { Suspense } from "react";
import { notFound } from "next/navigation";
import { StaffDocumentsView } from "@/components/documents/DocumentViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";

async function Body({ params }: PageProps<"/dashboard/[role]/applications/[id]/documents">) {
  const { role, id } = await params;
  if (role !== "bplo") notFound();
  await requireRole("bplo");
  return <StaffDocumentsView id={id} />;
}

export default function ApplicationDocumentsPage(props: PageProps<"/dashboard/[role]/applications/[id]/documents">) {
  return (
    <>
      <title>Application documents | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
