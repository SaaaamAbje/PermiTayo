import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BusinessForm } from "@/components/business/BusinessForm";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseNotice } from "@/components/ui/Notices";
import { requireRole } from "@/lib/auth/dal";
import { getMyBusiness } from "@/lib/business/queries";
import { manilaToday } from "@/lib/business/schemas";

async function Body({ params }: PageProps<"/dashboard/[role]/businesses/[id]/edit">) {
  const { role, id } = await params;
  if (role !== "applicant") notFound();
  await requireRole("applicant");
  const b = await getMyBusiness(id);
  if (!b) notFound();
  const back = `/dashboard/applicant/businesses/${b.id}`;

  return (
    <>
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to business profile
      </Link>
      <PageHeader title={`Edit ${b.registered_business_name}`} description={`Business reference ${b.business_reference_number}`} />
      {b.record_status === "inactive" ? (
        <PhaseNotice title="This profile is inactive">It cannot be edited. Contact the BPLO if this is a mistake.</PhaseNotice>
      ) : (
        <>
          <p className="mb-6 text-sm text-slate-600">
            Changes apply to drafts and future applications. Applications you have already submitted keep the details they were submitted with.
          </p>
          <BusinessForm
            mode="edit"
            businessId={b.id}
            cancelHref={back}
            today={manilaToday()}
            initial={{
              registeredBusinessName: b.registered_business_name,
              tradeName: b.trade_name ?? "",
              businessDescription: b.business_description ?? "",
              businessType: b.business_type,
              ownershipType: b.ownership_type,
              businessCategory: b.business_category,
              businessEmail: b.business_email ?? "",
              businessContactNumber: b.business_contact_number,
              province: b.province,
              municipality: b.municipality,
              barangay: b.barangay,
              streetAddress: b.street_address ?? "",
              zipCode: b.zip_code,
              ownerFullName: b.owner_full_name,
              ownerEmail: b.owner_email ?? "",
              ownerContactNumber: b.owner_contact_number,
              natureOfBusiness: b.nature_of_business,
              employeeCount: String(b.employee_count),
              estimatedCapital: b.estimated_capital === null ? "" : String(b.estimated_capital),
              establishmentStatus: b.establishment_status,
              dateEstablished: b.date_established ?? "",
            }}
          />
        </>
      )}
    </>
  );
}

export default function EditBusinessPage(props: PageProps<"/dashboard/[role]/businesses/[id]/edit">) {
  return (
    <>
      <title>Edit business profile | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
