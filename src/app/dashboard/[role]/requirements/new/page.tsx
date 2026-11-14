import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RequirementForm } from "@/components/documents/RequirementForm";
import { first } from "@/components/business/BusinessViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/dal";
import { DOCUMENT_MIME_TYPES } from "@/lib/documents/constants";
import { listPermitTypesForStaff } from "@/lib/documents/queries";

async function Body({ params, searchParams }: PageProps<"/dashboard/[role]/requirements/new">) {
  const { role } = await params;
  if (role !== "bplo" && role !== "admin") notFound();
  await requireRole(role);
  const sp = await searchParams;
  const types = await listPermitTypesForStaff();
  const selected = types.find((t) => t.id === first(sp.type)) ?? types[0];
  if (!selected) notFound();
  const back = `/dashboard/${role}/requirements?type=${selected.id}`;
  return (
    <>
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Permit requirements
      </Link>
      <PageHeader title="Add a requirement" description="Applicants see active requirements on the checklist of every application of this permit type." />
      <RequirementForm
        mode="create"
        permitTypes={types}
        permitTypeId={selected.id}
        cancelHref={back}
        initial={{
          name: "",
          description: "",
          applicantInstructions: "",
          isRequired: "required",
          acceptedFileTypes: [...DOCUMENT_MIME_TYPES],
          maxFileSizeMb: "5",
          displayOrder: "10",
          isActive: true,
        }}
      />
    </>
  );
}

export default function NewRequirementPage(props: PageProps<"/dashboard/[role]/requirements/new">) {
  return (
    <>
      <title>Add requirement | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
