import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BusinessForm } from "@/components/business/BusinessForm";
import { first } from "@/components/business/BusinessViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/auth/dal";
import { DEFAULT_MUNICIPALITY, DEFAULT_PROVINCE } from "@/lib/business/constants";
import { manilaToday } from "@/lib/business/schemas";

async function Body({ params, searchParams }: PageProps<"/dashboard/[role]/businesses/new">) {
  const { role } = await params;
  if (role !== "applicant") notFound();
  const user = await requireRole("applicant");
  const sp = await searchParams;
  const returnTo = first(sp.returnTo) === "new-application" ? "new-application" : undefined;

  return (
    <>
      <Link href={returnTo ? "/dashboard/applicant/new-application" : "/dashboard/applicant/businesses"} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {returnTo ? "Back to the application" : "My businesses"}
      </Link>
      <PageHeader title="Register a business" description="Enter your business details. You can edit them later." />
      <BusinessForm
        mode="create"
        returnTo={returnTo}
        cancelHref={returnTo ? "/dashboard/applicant/new-application" : "/dashboard/applicant/businesses"}
        today={manilaToday()}
        initial={{
          province: DEFAULT_PROVINCE,
          municipality: DEFAULT_MUNICIPALITY,
          ownerFullName: user.fullName,
          ownerEmail: user.email,
          ownerContactNumber: user.phoneNumber ?? "",
          employeeCount: "0",
        }}
      />
    </>
  );
}

export default function NewBusinessPage(props: PageProps<"/dashboard/[role]/businesses/new">) {
  return (
    <>
      <title>Register a business | Permitayo</title>
      <Suspense fallback={<PageSkeleton />}>
        <Body {...props} />
      </Suspense>
    </>
  );
}
