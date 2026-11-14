import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getMyApplication, listPermitTypes } from "@/lib/applications/queries";
import { listSelectableBusinesses } from "@/lib/business/queries";
import { formatBusinessAddress } from "@/lib/business/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseNotice } from "@/components/ui/Notices";
import { ApplicationWizard, type WizardValues } from "./ApplicationWizard";

/** Loads everything the application form needs, for a new application or an existing draft. */
export async function ApplicationFormLoader({ applicationId, preselectBusinessId }: { applicationId?: string; preselectBusinessId?: string }) {
  const user = await requireRole("applicant");
  const [businesses, permitTypes, existing] = await Promise.all([
    listSelectableBusinesses(),
    listPermitTypes(),
    applicationId ? getMyApplication(applicationId) : Promise.resolve(null),
  ]);

  let initial: WizardValues;
  if (applicationId) {
    if (!existing) notFound();
    if (existing.app.application_status !== "draft") redirect(`/dashboard/applicant/applications/${existing.app.id}`);
    const a = existing.app;
    initial = {
      businessId: businesses.some((b) => b.id === a.business_id) ? a.business_id : "",
      permitTypeId: permitTypes.some((t) => t.id === a.permit_type_id) ? a.permit_type_id : "",
      businessName: a.business_name ?? "",
      businessAddress: a.business_address ?? "",
      natureOfBusiness: a.nature_of_business ?? "",
      businessCategory: a.business_category ?? "",
      applicantRemarks: a.applicant_remarks ?? "",
    };
  } else {
    const pre = businesses.find((b) => b.id === preselectBusinessId) ?? (businesses.length === 1 ? businesses[0] : undefined);
    initial = {
      businessId: pre?.id ?? "",
      permitTypeId: "",
      businessName: pre?.registered_business_name ?? "",
      businessAddress: pre ? formatBusinessAddress(pre) : "",
      natureOfBusiness: pre?.nature_of_business ?? "",
      businessCategory: pre?.business_category ?? "",
      applicantRemarks: "",
    };
  }

  return (
    <>
      <PageHeader
        title={applicationId ? "Continue draft application" : "New business permit application"}
        description="Choose a business, fill in the application, review it, then save it as a draft or submit it."
      />
      {permitTypes.length === 0 ? (
        <PhaseNotice title="Applications are not open">No application types are available right now. Please check again later.</PhaseNotice>
      ) : (
        <ApplicationWizard
          businesses={businesses}
          permitTypes={permitTypes}
          applicant={{ fullName: user.fullName, email: user.email, phone: user.phoneNumber }}
          initial={initial}
          applicationId={applicationId}
          cancelHref={applicationId ? `/dashboard/applicant/applications/${applicationId}` : "/dashboard/applicant/applications"}
        />
      )}
    </>
  );
}
