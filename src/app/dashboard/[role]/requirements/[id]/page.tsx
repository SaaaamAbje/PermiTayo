import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RequirementForm } from "@/components/documents/RequirementForm";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/dal";
import { MB } from "@/lib/documents/constants";
import { getRequirementForStaff, listPermitTypesForStaff } from "@/lib/documents/queries";
import { formatDateTime } from "@/lib/format";

async function Body({ params }: PageProps<"/dashboard/[role]/requirements/[id]">) {
  const { role, id } = await params;
  if (role !== "bplo" && role !== "admin") notFound();
  await requireRole(role);
  const [r, types] = await Promise.all([getRequirementForStaff(id), listPermitTypesForStaff()]);
  if (!r) notFound();
  const back = `/dashboard/${role}/requirements?type=${r.permit_type_id}`;
  return (
    <>
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Permit requirements
      </Link>
      <PageHeader title={`Edit: ${r.name}`} description={`${r.permit_types?.name ?? ""} · created ${formatDateTime(r.created_at)} · last updated ${formatDateTime(r.updated_at)}`} />
      <RequirementForm
        mode="edit"
        requirementId={r.id}
        permitTypes={types}
        permitTypeId={r.permit_type_id}
        cancelHref={back}
        initial={{
          name: r.name,
          description: r.description ?? "",
          applicantInstructions: r.applicant_instructions ?? "",
          isRequired: r.is_required ? "required" : "optional",
          acceptedFileTypes: r.accepted_file_types,
          maxFileSizeMb: String(Math.round((r.max_file_size / MB) * 10) / 10),
          displayOrder: String(r.display_order),
          isActive: r.is_active,
        }}
      />
    </>
  );
}

export default function EditRequirementPage(props: PageProps<"/dashboard/[role]/requirements/[id]">) {
  return (
    <>
      <title>Edit requirement | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
