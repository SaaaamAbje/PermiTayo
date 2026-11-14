import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ListChecks, Plus } from "lucide-react";
import {
  VERIFICATION_PAGE_SIZE,
  getApplicantChecklist,
  getStaffChecklist,
  listApplicantDocumentOverview,
  listPermitTypesForStaff,
  listRequirementsForType,
  listVerificationQueue,
  type ChecklistSummary,
} from "@/lib/documents/queries";
import { formatAcceptedTypes, formatFileSize } from "@/lib/documents/constants";
import { applicationSearchSchema } from "@/lib/applications/schemas";
import { requireRole } from "@/lib/auth/dal";
import { formatDate, formatDateTime } from "@/lib/format";
import type { RoleId } from "@/lib/roles";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseNotice } from "@/components/ui/Notices";
import { Pagination, parsePage } from "@/components/ui/Pagination";
import { ApplicationStatusBadge } from "@/components/applications/StatusBadges";
import { first, type SearchParams } from "@/components/business/BusinessViews";
import { ChecklistSummaryBar, DocumentChecklist } from "./DocumentChecklist";
import { RequirementToggle } from "./RequirementToggle";

function SavedNotice({ text }: { text: string }) {
  return <p role="status" className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{text}</p>;
}

function progressText(c: ChecklistSummary) {
  return c.requiredTotal === 0 ? "No required documents" : `${c.requiredUploaded}/${c.requiredTotal} required uploaded`;
}

function CountBadges({ c }: { c: ChecklistSummary }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {c.awaitingReview > 0 ? <Badge tone="info">{c.awaitingReview} to review</Badge> : null}
      {c.needsResubmission > 0 ? <Badge tone="warning">{c.needsResubmission} need resubmission</Badge> : null}
      {c.accepted > 0 ? <Badge tone="success">{c.accepted} accepted</Badge> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Permit requirements (BPLO personnel and administrators)
// ---------------------------------------------------------------------------
export async function RequirementsManagerView({ roleId, searchParams }: { roleId: RoleId; searchParams: SearchParams }) {
  const sp = await searchParams;
  const types = await listPermitTypesForStaff();
  const selected = types.find((t) => t.id === first(sp.type)) ?? types[0];
  const rows = selected ? await listRequirementsForType(selected.id) : [];
  const base = `/dashboard/${roleId}/requirements`;
  const saved = first(sp.saved);
  const hasSamples = rows.some((r) => r.name.startsWith("Sample:"));

  return (
    <>
      {saved === "created" ? <SavedNotice text="Requirement added." /> : saved === "updated" ? <SavedNotice text="Requirement updated." /> : null}
      <PhaseNotice title="Configure the official requirements" className="mb-6">
        Requirements are set per permit type. Rows named &ldquo;Sample:&rdquo; are placeholders, not official municipal requirements,
        and start inactive. Replace them with the BPLO&apos;s official list, then activate them. Only active requirements are shown
        to applicants. Every change is recorded in the audit log.
      </PhaseNotice>

      {types.length === 0 ? (
        <Card><CardBody><p className="text-sm text-slate-600">No permit types exist yet.</p></CardBody></Card>
      ) : (
        <>
          <nav aria-label="Permit types" className="mb-4 flex flex-wrap gap-2">
            {types.map((t) => (
              <Link
                key={t.id}
                href={`${base}?type=${t.id}`}
                aria-current={t.id === selected?.id ? "page" : undefined}
                className={
                  t.id === selected?.id
                    ? "rounded-full bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white"
                    : "rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                }
              >
                {t.name}
                {!t.is_active ? " (inactive type)" : ""}
              </Link>
            ))}
          </nav>
          <Card>
            <CardHeader
              title={`${selected!.name} requirements`}
              description={`${rows.filter((r) => r.is_active).length} active · ${rows.filter((r) => !r.is_active).length} inactive`}
              action={<Button href={`${base}/new?type=${selected!.id}`} size="sm"><Plus className="h-4 w-4" aria-hidden="true" /> Add requirement</Button>}
            />
            <DataTable
              caption={`Requirements for ${selected!.name}`}
              rows={rows}
              rowKey={(r) => r.id}
              empty="No requirements for this permit type yet. Add the first one."
              columns={[
                { key: "order", header: "Order", hideOnMobile: true, render: (r) => r.display_order },
                {
                  key: "name",
                  header: "Requirement",
                  render: (r) => (
                    <Link href={`${base}/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.name}
                      <span className="block text-xs font-normal text-slate-500">
                        {formatAcceptedTypes(r.accepted_file_types)} · up to {formatFileSize(r.max_file_size)}
                      </span>
                    </Link>
                  ),
                },
                { key: "required", header: "Type", render: (r) => <Badge tone={r.is_required ? "brand" : "neutral"}>{r.is_required ? "Required" : "Optional"}</Badge> },
                {
                  key: "status",
                  header: "Status",
                  render: (r) => (
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Inactive"}</Badge>
                      {r.name.startsWith("Sample:") ? <Badge tone="warning">Sample</Badge> : null}
                    </span>
                  ),
                },
                { key: "updated", header: "Updated", hideOnMobile: true, render: (r) => formatDate(r.updated_at) },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  render: (r) => (
                    <span className="flex items-center justify-end gap-1">
                      <Button href={`${base}/${r.id}`} variant="ghost" size="sm">Edit</Button>
                      <RequirementToggle requirementId={r.id} active={r.is_active} name={r.name} />
                    </span>
                  ),
                },
              ]}
            />
          </Card>
          {hasSamples ? <p className="mt-3 text-xs text-slate-500">Sample rows cannot be activated until they are renamed to the official requirement, so applicants never see placeholder text.</p> : null}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// BPLO: Requirements Verification queue
// ---------------------------------------------------------------------------
export async function VerificationQueueView({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("bplo");
  const sp = await searchParams;
  const qParsed = applicationSearchSchema.safeParse(first(sp.q) ?? "");
  const q = qParsed.success ? qParsed.data : "";
  const page = parsePage(first(sp.page));
  const { rows, total } = await listVerificationQueue({ q: q || undefined, page });
  const base = "/dashboard/bplo/verification";

  return (
    <>
      <PhaseNotice title="Manual review only" className="mb-6">
        Open an application to view its documents and accept them or ask for a resubmission. Automated (AI) checking is not part of
        this version. Personnel make every decision.
      </PhaseNotice>
      <Card>
        <CardHeader title="Submitted applications" description={`${total} ${total === 1 ? "application" : "applications"}, oldest submission first`} />
        <form method="get" role="search" aria-label="Search submitted applications" className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-4">
          <label htmlFor="verify-q" className="sr-only">Search by reference number or business name</label>
          <TextInput id="verify-q" name="q" type="search" defaultValue={q} placeholder="Reference number or business name" maxLength={80} className="max-w-md" />
          <Button type="submit" size="lg" className="h-11">Search</Button>
          {q ? <Button href={base} variant="secondary" size="lg" className="h-11">Clear</Button> : null}
        </form>
        <DataTable
          caption="Submitted applications and their documents"
          rows={rows}
          rowKey={(r) => r.id}
          empty={q ? "No submitted applications match that search." : "No submitted applications yet."}
          columns={[
            {
              key: "ref",
              header: "Reference",
              render: (r) => (
                <Link href={`/dashboard/bplo/applications/${r.id}/documents`} className="font-medium text-brand-700 hover:underline">
                  {r.reference_number}
                  <span className="block text-xs font-normal text-slate-500">{r.business_name}</span>
                </Link>
              ),
            },
            { key: "type", header: "Type", hideOnMobile: true, render: (r) => r.permit_types?.name ?? "" },
            { key: "submitted", header: "Submitted", hideOnMobile: true, render: (r) => (r.submitted_at ? formatDate(r.submitted_at) : "") },
            { key: "progress", header: "Documents", render: (r) => <span className="text-sm">{progressText(r.counts)}</span> },
            { key: "status", header: "Review", render: (r) => <CountBadges c={r.counts} /> },
            {
              key: "open",
              header: "Actions",
              className: "text-right",
              render: (r) => <Button href={`/dashboard/bplo/applications/${r.id}/documents`} variant="ghost" size="sm">Review documents</Button>,
            },
          ]}
        />
        <Pagination base={base} params={{ q: q || undefined }} page={page} total={total} size={VERIFICATION_PAGE_SIZE} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Applicant: Documents overview
// ---------------------------------------------------------------------------
export async function ApplicantDocumentsView() {
  const rows = await listApplicantDocumentOverview();
  if (rows.length === 0) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">No applications to upload documents for</h2>
          <p className="max-w-md text-sm text-slate-600">Start an application first. Its required documents will then be listed here.</p>
          <Button href="/dashboard/applicant/new-application">Start new application</Button>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Your applications" description="Open an application to upload or check its documents." />
      <DataTable
        caption="Document progress per application"
        rows={rows}
        rowKey={(r) => r.id}
        empty=""
        columns={[
          {
            key: "ref",
            header: "Application",
            render: (r) => (
              <Link href={`/dashboard/applicant/applications/${r.id}/requirements`} className="font-medium text-brand-700 hover:underline">
                {r.reference_number ?? "Draft"}
                <span className="block text-xs font-normal text-slate-500">{r.business_name} · {r.permit_types?.name}</span>
              </Link>
            ),
          },
          { key: "status", header: "Status", hideOnMobile: true, render: (r) => <ApplicationStatusBadge status={r.application_status} /> },
          { key: "progress", header: "Documents", render: (r) => progressText(r.counts) },
          { key: "review", header: "Review", hideOnMobile: true, render: (r) => <CountBadges c={r.counts} /> },
          {
            key: "open",
            header: "Actions",
            className: "text-right",
            render: (r) => <Button href={`/dashboard/applicant/applications/${r.id}/requirements`} variant="ghost" size="sm">Open checklist</Button>,
          },
        ]}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Applicant: requirements checklist for one application
// ---------------------------------------------------------------------------
export async function ApplicantRequirementsView({ id }: { id: string }) {
  const user = await requireRole("applicant");
  const data = await getApplicantChecklist(id);
  if (!data) notFound();
  const { app } = data;
  return (
    <div className="space-y-6">
      <Link href={`/dashboard/applicant/applications/${app.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to application
      </Link>
      <PageHeader
        title="Requirements"
        description={`${app.reference_number ?? "Draft application"} · ${app.permit_types?.name ?? ""} · ${app.business_name ?? ""}`}
        actions={<ApplicationStatusBadge status={app.application_status} />}
      />
      <Card>
        <CardBody className="space-y-3">
          <ChecklistSummaryBar summary={data.summary} />
          <p className="text-xs text-slate-500">
            {app.application_status === "draft"
              ? "You can upload and replace documents while this application is a draft."
              : app.application_status === "submitted"
                ? "This application is submitted. You can upload documents that are still missing, and replace a document only if the BPLO asks for a resubmission."
                : "This application was cancelled. Its documents are kept for the record."}{" "}
            Uploaded files are private. Only you and authorized BPLO personnel can open them.
          </p>
        </CardBody>
      </Card>
      <DocumentChecklist data={data} mode="applicant" viewerId={user.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BPLO: document review for one application
// ---------------------------------------------------------------------------
export async function StaffDocumentsView({ id }: { id: string }) {
  const user = await requireRole("bplo");
  const data = await getStaffChecklist(id);
  if (!data) notFound();
  const { app } = data;
  const applicant = app.submission_snapshot?.applicant;
  return (
    <div className="space-y-6">
      <Link href="/dashboard/bplo/verification" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Requirements verification
      </Link>
      <PageHeader title={`Documents: ${app.reference_number ?? ""}`} description={`${app.permit_types?.name ?? ""} · ${app.business_name ?? ""}`} actions={<ApplicationStatusBadge status={app.application_status} />} />
      <Card>
        <CardBody className="space-y-4">
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-500">Applicant</dt><dd className="font-medium text-slate-900">{applicant?.full_name ?? "Not recorded"}</dd></div>
            <div><dt className="text-slate-500">Contact</dt><dd className="break-words font-medium text-slate-900">{applicant?.email ?? ""}{applicant?.phone_number ? ` · ${applicant.phone_number}` : ""}</dd></div>
            <div><dt className="text-slate-500">Business address</dt><dd className="font-medium text-slate-900">{app.business_address ?? ""}</dd></div>
            <div><dt className="text-slate-500">Submitted</dt><dd className="font-medium text-slate-900">{app.submitted_at ? formatDateTime(app.submitted_at) : ""}</dd></div>
          </dl>
          <ChecklistSummaryBar summary={data.summary} />
          {app.application_status !== "submitted" ? (
            <p className="text-sm text-slate-600">This application is {app.application_status}. Its documents can be viewed but not reviewed.</p>
          ) : null}
        </CardBody>
      </Card>
      <DocumentChecklist data={data} mode="bplo" viewerId={user.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Applicant: summary card on the application detail page
// ---------------------------------------------------------------------------
export async function RequirementsSummaryCard({ applicationId }: { applicationId: string }) {
  const data = await getApplicantChecklist(applicationId);
  if (!data) return null;
  const href = `/dashboard/applicant/applications/${applicationId}/requirements`;
  const s = data.summary;
  return (
    <Card>
      <CardHeader
        title="Requirements"
        description="Supporting documents for this application."
        action={
          <Button href={href} size="sm" variant={s.needsResubmission > 0 ? "gold" : "primary"}>
            <ListChecks className="h-4 w-4" aria-hidden="true" /> {data.app.application_status === "cancelled" ? "View documents" : "Open requirements"}
          </Button>
        }
      />
      <CardBody className="space-y-2">
        {data.items.length === 0 ? (
          <p className="text-sm text-slate-600">The BPLO has not published document requirements for this application type yet.</p>
        ) : (
          <>
            <ChecklistSummaryBar summary={s} />
            {s.needsResubmission > 0 ? (
              <p className="text-sm font-medium text-amber-800">The BPLO asked you to resubmit {s.needsResubmission} {s.needsResubmission === 1 ? "document" : "documents"}.</p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
