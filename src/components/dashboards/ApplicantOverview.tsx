import Link from "next/link";
import { Building2, FilePlus2, FileText, FolderOpen, PenLine, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getApplicantDashboard } from "@/lib/applications/queries";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ApplicationsTable } from "@/components/applications/ApplicationViews";

const QUICK_ACTIONS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: "/dashboard/applicant/businesses/new", label: "Register a Business", description: "Add a business profile.", icon: Building2 },
  { href: "/dashboard/applicant/new-application", label: "Start New Application", description: "New, renewal or amendment.", icon: FilePlus2 },
  { href: "/dashboard/applicant/businesses", label: "View My Businesses", description: "Profiles and their history.", icon: FolderOpen },
  { href: "/dashboard/applicant/applications", label: "View My Applications", description: "Drafts and submissions.", icon: FileText },
];

/** Applicant overview. Every figure is read from the applicant's own rows in Supabase. */
export async function ApplicantOverview({ firstName }: { firstName: string }) {
  const d = await getApplicantDashboard();

  return (
    <>
      <PageHeader title={`Good day, ${firstName}`} description="Here is where your business profiles and permit applications stand." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Business Profiles" value={String(d.businessCount)} icon={Building2} />
        <StatCard label="Total Applications" value={String(d.applicationCount)} icon={FileText} accent="slate" />
        <StatCard label="Draft Applications" value={String(d.draftCount)} icon={PenLine} accent="gold" />
        <StatCard label="Submitted Applications" value={String(d.submittedCount)} icon={Send} accent="green" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent applications"
            action={d.applicationCount > 0 ? <Button href="/dashboard/applicant/applications" variant="ghost" size="sm">View all</Button> : undefined}
          />
          {d.recent.length === 0 ? (
            <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="text-base font-semibold text-slate-900">You have no applications yet</h2>
              <p className="max-w-md text-sm text-slate-600">
                {d.businessCount === 0
                  ? "Start by registering your business. You can then apply for a new permit, a renewal or an amendment."
                  : "Start an application from one of your business profiles."}
              </p>
              <Button href={d.businessCount === 0 ? "/dashboard/applicant/businesses/new" : "/dashboard/applicant/new-application"}>
                {d.businessCount === 0 ? "Register a business" : "Start new application"}
              </Button>
            </CardBody>
          ) : (
            <ApplicationsTable rows={d.recent} empty="No applications yet." />
          )}
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <ul className="divide-y divide-slate-100">
            {QUICK_ACTIONS.map(({ href, label, description, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{label}</span>
                    <span className="block text-xs text-slate-500">{description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
