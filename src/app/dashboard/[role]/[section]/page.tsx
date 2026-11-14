import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  AdminAuditView,
  AdminDepartmentsView,
  AdminUsersView,
} from "@/components/admin/AdminViews";
import { ProfileForm } from "@/components/dashboards/ProfileView";
import {
  ApplicantDocumentsView,
  RequirementsManagerView,
  VerificationQueueView,
} from "@/components/documents/DocumentViews";
import { PageSkeleton } from "@/components/layout/ShellLoader";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseNotice } from "@/components/ui/Notices";
import { RoleBadge, StatusPill } from "@/components/admin/AdminViews";
import { requireRole } from "@/lib/auth/dal";
import { DEDICATED_SECTIONS, isRoleId, ROLES, ROLE_ORDER, type RoleId } from "@/lib/roles";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function generateStaticParams() {
  return ROLE_ORDER.flatMap((role) =>
    ROLES[role].nav.filter((n) => n.slug && !DEDICATED_SECTIONS.has(n.slug)).map((n) => ({ role, section: n.slug })),
  );
}

function findItem(role: RoleId, section: string) {
  return ROLES[role].nav.find((n) => n.slug === section);
}

async function SectionBody({
  role,
  section,
  searchParams,
}: {
  role: RoleId;
  section: string;
  searchParams: SearchParams;
}) {
  // Re-verify the session and role on every navigation, close to the data.
  const user = await requireRole(role);

  if (section === "profile") {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your details" description="You can change your name and mobile number." />
          <CardBody>
            <ProfileForm fullName={user.fullName} phone={user.phoneNumber ?? ""} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Account" description="Managed by administrators." />
          <CardBody>
            <dl className="space-y-4 text-sm">
              <div><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-900">{user.email}</dd></div>
              <div><dt className="text-slate-500">Role</dt><dd className="mt-1"><RoleBadge role={user.dbRole} /></dd></div>
              <div><dt className="text-slate-500">Status</dt><dd className="mt-1"><StatusPill status={user.status} /></dd></div>
              {user.dbRole !== "applicant" && user.dbRole !== "administrator" ? (
                <div>
                  <dt className="text-slate-500">Department</dt>
                  <dd className="mt-1 flex flex-wrap gap-2">
                    {user.departments.length === 0 ? (
                      <span className="text-slate-600">Not assigned yet. Ask an administrator.</span>
                    ) : (
                      user.departments.map((d) => (
                        <Badge key={d.id} tone="brand">{d.name} ({d.code}){d.position ? ` · ${d.position}` : ""}</Badge>
                      ))
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (role === "applicant" && section === "documents") return <ApplicantDocumentsView />;
  if (role === "bplo" && section === "verification") return <VerificationQueueView searchParams={searchParams} />;
  if ((role === "bplo" || role === "admin") && section === "requirements") {
    return <RequirementsManagerView roleId={role} searchParams={searchParams} />;
  }

  if (role === "admin") {
    if (section === "users") return <AdminUsersView searchParams={searchParams} />;
    if (section === "departments") return <AdminDepartmentsView />;
    if (section === "audit") return <AdminAuditView searchParams={searchParams} />;
  }

  const item = findItem(role, section)!;
  return (
    <PhaseNotice title="Opening soon">
      This section is not available yet.
      {item.planned.length > 0 ? (
        <>
          {" "}It will let you:
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {item.planned.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      ) : null}
    </PhaseNotice>
  );
}

export default async function SectionPage({ params, searchParams }: PageProps<"/dashboard/[role]/[section]">) {
  const { role, section } = await params;
  if (!isRoleId(role)) notFound();
  const item = findItem(role, section);
  if (!item || !section) notFound();

  return (
    <>
      <title>{`${item.label} | Permitayo`}</title>
      <PageHeader title={item.label} description={item.description} />
      <Suspense fallback={<PageSkeleton />}>
        <SectionBody role={role} section={section} searchParams={searchParams} />
      </Suspense>
    </>
  );
}
