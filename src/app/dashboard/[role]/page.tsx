import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ApplicantOverview } from "@/components/dashboards/ApplicantOverview";
import { BploOverview } from "@/components/dashboards/BploOverview";
import { ReviewerOverview } from "@/components/dashboards/ReviewerOverview";
import { HeadOverview } from "@/components/dashboards/HeadOverview";
import { AdminOverview } from "@/components/dashboards/AdminOverview";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { requireRole } from "@/lib/auth/dal";
import { isRoleId, ROLES, type RoleId } from "@/lib/roles";

async function Overview({ role }: { role: RoleId }) {
  // Re-checked on every navigation; the layout alone only runs on first load.
  const user = await requireRole(role);
  switch (role) {
    case "applicant":
      return <ApplicantOverview firstName={user.fullName.split(/\s+/)[0]} />;
    case "bplo":
      return <BploOverview />;
    case "department":
      return <ReviewerOverview />;
    case "department-head":
      return <HeadOverview />;
    case "admin":
      return <AdminOverview />;
  }
}

export default async function RoleOverviewPage({ params }: PageProps<"/dashboard/[role]">) {
  const { role } = await params;
  if (!isRoleId(role)) notFound();
  return (
    <>
      <title>{`${ROLES[role].label} dashboard | Permitayo`}</title>
      <Suspense fallback={<PageSkeleton />}>
        <Overview role={role} />
      </Suspense>
    </>
  );
}
