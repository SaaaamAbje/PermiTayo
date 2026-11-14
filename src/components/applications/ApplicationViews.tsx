import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FilePlus2, FileText, Pencil } from "lucide-react";
import { getMyApplication, listMyApplications, listPermitTypes } from "@/lib/applications/queries";
import { APPLICATIONS_PAGE_SIZE, APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from "@/lib/applications/constants";
import { applicationSearchSchema, applicationSortSchema, applicationStatusFilter } from "@/lib/applications/schemas";
import type { DbApplicationStatus } from "@/lib/database.types";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Select, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination, parsePage } from "@/components/ui/Pagination";
import { BusinessDetailsCards, first, type SearchParams } from "@/components/business/BusinessViews";
import { ApplicationStatusBadge, RecordStatusBadge } from "./StatusBadges";
import { CancelApplicationButton, DeleteDraftButton } from "./ApplicationActions";

const BASE = "/dashboard/applicant/applications";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// My Applications
// ---------------------------------------------------------------------------
export async function MyApplicationsView({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const qParsed = applicationSearchSchema.safeParse(first(sp.q) ?? "");
  const q = qParsed.success ? qParsed.data : "";
  const statusParsed = applicationStatusFilter.safeParse(first(sp.status));
  const status = statusParsed.success ? (statusParsed.data as DbApplicationStatus) : undefined;
  const sortParsed = applicationSortSchema.safeParse(first(sp.sort));
  const sort = sortParsed.success ? sortParsed.data : "newest";
  const rawType = first(sp.type) ?? "";
  const page = parsePage(first(sp.page));

  const types = await listPermitTypes();
  const typeId = UUID.test(rawType) && types.some((t) => t.id === rawType) ? rawType : undefined;
  const { rows, total } = await listMyApplications({ q: q || undefined, typeId, status, sort, page });
  const filtered = Boolean(q || typeId || status);
  const deleted = first(sp.deleted) === "1";

  return (
    <>
      <PageHeader
        title="My Applications"
        description="Every business permit application you have started or submitted."
        actions={<Button href="/dashboard/applicant/new-application"><FilePlus2 className="h-4 w-4" aria-hidden="true" /> Start new application</Button>}
      />
      {deleted ? (
        <p role="status" className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">The draft was deleted.</p>
      ) : null}
      <Card>
        <CardHeader title="Applications" description={`${total} ${total === 1 ? "application" : "applications"}${filtered ? " match your filters" : ""}`} />
        <form method="get" role="search" aria-label="Filter applications" className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <div>
            <label htmlFor="app-q" className="sr-only">Search by reference number or business name</label>
            <TextInput id="app-q" name="q" type="search" defaultValue={q} placeholder="Reference number or business name" maxLength={80} aria-invalid={!qParsed.success} />
            {!qParsed.success ? <p role="alert" className="mt-1 text-xs text-red-600">Use letters, numbers, spaces, periods, apostrophes, ampersands or hyphens only.</p> : null}
          </div>
          <div>
            <label htmlFor="app-type" className="sr-only">Filter by application type</label>
            <Select id="app-type" name="type" defaultValue={typeId ?? ""}>
              <option value="">All types</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="app-status" className="sr-only">Filter by status</label>
            <Select id="app-status" name="status" defaultValue={status ?? ""}>
              <option value="">All statuses</option>
              {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{APPLICATION_STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="app-sort" className="sr-only">Sort by creation date</label>
            <Select id="app-sort" name="sort" defaultValue={sort}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="lg" className="h-11">Apply</Button>
            {filtered || sort !== "newest" ? <Button href={BASE} variant="secondary" size="lg" className="h-11">Clear</Button> : null}
          </div>
        </form>
        {total === 0 && !filtered ? (
          <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-slate-900">You have no applications yet</h2>
            <p className="max-w-md text-sm text-slate-600">Start an application from one of your business profiles. You can save it as a draft and submit it when ready.</p>
            <Button href="/dashboard/applicant/new-application">Start new application</Button>
          </CardBody>
        ) : (
          <ApplicationsTable rows={rows} empty="No applications match those filters." />
        )}
        <Pagination base={BASE} params={{ q: q || undefined, type: typeId, status, sort: sort === "newest" ? undefined : sort }} page={page} total={total} size={APPLICATIONS_PAGE_SIZE} />
      </Card>
    </>
  );
}

type ListRow = Awaited<ReturnType<typeof listMyApplications>>["rows"][number];

/** Shared by My Applications and the dashboard's Recent Applications. */
export function ApplicationsTable({ rows, empty }: { rows: ListRow[]; empty: string }) {
  return (
    <DataTable
      caption="Your applications"
      rows={rows}
      rowKey={(r) => r.id}
      empty={empty}
      columns={[
        {
          key: "ref",
          header: "Reference",
          render: (r) => (
            <Link href={`${BASE}/${r.id}`} className="font-medium text-brand-700 hover:underline">
              {r.reference_number ?? <span className="italic">Draft</span>}
              <span className="block text-xs font-normal text-slate-500">Created {formatDate(r.created_at)}</span>
            </Link>
          ),
        },
        { key: "business", header: "Business", render: (r) => r.business_name || r.business_establishments?.registered_business_name || "" },
        { key: "type", header: "Type", hideOnMobile: true, render: (r) => r.permit_types?.name ?? "" },
        { key: "submitted", header: "Submitted", hideOnMobile: true, render: (r) => (r.submitted_at ? formatDate(r.submitted_at) : <span className="text-slate-400">Not submitted</span>) },
        { key: "status", header: "Status", render: (r) => <ApplicationStatusBadge status={r.application_status} /> },
        {
          key: "actions",
          header: "Actions",
          className: "text-right",
          render: (r) => (
            <span className="flex justify-end gap-1">
              <Button href={`${BASE}/${r.id}`} variant="ghost" size="sm">View</Button>
              {r.application_status === "draft" ? <Button href={`${BASE}/${r.id}/edit`} variant="ghost" size="sm">Continue</Button> : null}
            </span>
          ),
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Application detail
// ---------------------------------------------------------------------------
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words font-medium text-slate-900">{children}</dd>
    </div>
  );
}

const SAVED_MESSAGES: Record<string, string> = {
  draft: "Your draft was saved. You can continue editing it at any time.",
  submitted: "Your application was submitted. Keep the reference number for your records.",
};

export async function ApplicationDetailView({ id, saved }: { id: string; saved?: string }) {
  const detail = await getMyApplication(id);
  if (!detail) notFound();
  const { app, history, applicantId } = detail;
  const isDraft = app.application_status === "draft";
  const canCancel = app.application_status === "draft" || app.application_status === "submitted";
  const snapshot = app.submission_snapshot;
  const typeName = snapshot?.permit_type.name ?? app.permit_types?.name ?? "";

  return (
    <div className="space-y-6">
      <Link href={BASE} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My applications
      </Link>
      <PageHeader
        title={app.reference_number ?? "Draft application"}
        description={`${typeName} · ${app.business_name || app.business_establishments?.registered_business_name || ""}`}
        actions={<ApplicationStatusBadge status={app.application_status} />}
      />

      {saved && SAVED_MESSAGES[saved] ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{SAVED_MESSAGES[saved]}</p>
      ) : null}

      <Card>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Item label="Reference number">{app.reference_number ?? <span className="font-normal text-slate-500">Assigned when you submit</span>}</Item>
            <Item label="Application type">{typeName}</Item>
            <Item label="Status"><ApplicationStatusBadge status={app.application_status} /></Item>
            <Item label="Submitted">{app.submitted_at ? formatDateTime(app.submitted_at) : <span className="font-normal text-slate-500">Not submitted</span>}</Item>
            <Item label="Created">{formatDateTime(app.created_at)}</Item>
            <Item label="Last updated">{formatDateTime(app.updated_at)}</Item>
            {app.cancelled_at ? <Item label="Cancelled">{formatDateTime(app.cancelled_at)}</Item> : null}
            {app.cancelled_at ? (
              <Item label="Cancelled by">{app.cancelled_by === applicantId ? "You" : "Authorized personnel"}</Item>
            ) : null}
          </dl>
          {app.cancellation_reason ? (
            <p className="mt-4 text-sm text-slate-700"><span className="font-medium">Cancellation reason:</span> {app.cancellation_reason}</p>
          ) : null}
          {app.application_status === "submitted" ? (
            <p className="mt-4 text-sm text-slate-600">
              Submitted applications cannot be edited. If something needs correcting, contact the BPLO. A correction process will be
              added in a later version.
            </p>
          ) : null}
        </CardBody>
        {isDraft || canCancel ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
            {isDraft ? <Button href={`${BASE}/${app.id}/edit`}><Pencil className="h-4 w-4" aria-hidden="true" /> Continue editing</Button> : null}
            {canCancel ? <CancelApplicationButton applicationId={app.id} isDraft={isDraft} /> : null}
            {isDraft ? <DeleteDraftButton applicationId={app.id} /> : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Application information" description={snapshot ? "As submitted." : "Current draft. You can change this until you submit."} />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Business name">{app.business_name || <span className="font-normal text-slate-400">Not provided</span>}</Item>
            <Item label="Business category">{app.business_category || <span className="font-normal text-slate-400">Not provided</span>}</Item>
            <Item label="Business address">{app.business_address || <span className="font-normal text-slate-400">Not provided</span>}</Item>
            <Item label="Nature of business">{app.nature_of_business || <span className="font-normal text-slate-400">Not provided</span>}</Item>
            <div className="sm:col-span-2">
              <Item label="Applicant remarks">{app.applicant_remarks || <span className="font-normal text-slate-400">None</span>}</Item>
            </div>
          </dl>
        </CardBody>
      </Card>

      {snapshot ? (
        <section aria-labelledby="snapshot-heading" className="space-y-4">
          <div>
            <h2 id="snapshot-heading" className="text-lg font-semibold text-slate-900">Business profile at submission</h2>
            <p className="text-sm text-slate-600">
              A copy saved when you submitted ({snapshot.business.business_reference_number}). Later edits to the business profile do not
              change this application. Applicant: {snapshot.applicant.full_name} ({snapshot.applicant.email}).
            </p>
          </div>
          <BusinessDetailsCards b={snapshot.business} />
        </section>
      ) : app.business_establishments ? (
        <Card>
          <CardHeader
            title="Business profile"
            action={<Button href={`/dashboard/applicant/businesses/${app.business_establishments.id}`} variant="ghost" size="sm">View profile</Button>}
          />
          <CardBody>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Item label="Registered name">{app.business_establishments.registered_business_name}</Item>
              <Item label="Business reference">{app.business_establishments.business_reference_number}</Item>
              <Item label="Owner">{app.business_establishments.owner_full_name}</Item>
              <Item label="Record status"><RecordStatusBadge status={app.business_establishments.record_status} /></Item>
            </dl>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Application history" description="Every status change, oldest first." />
        {history.length === 0 ? (
          <CardBody><p className="text-sm text-slate-600">No history recorded.</p></CardBody>
        ) : (
          <CardBody>
            <ol className="relative space-y-6 border-l-2 border-slate-200 pl-6">
              {history.map((h, i) => (
                <li key={h.id} className="relative">
                  <span
                    className={
                      i === history.length - 1
                        ? "absolute -left-[33px] top-0.5 h-4 w-4 rounded-full border-2 border-brand-600 bg-white ring-4 ring-brand-100"
                        : "absolute -left-[33px] top-0.5 h-4 w-4 rounded-full border-2 border-emerald-500 bg-emerald-500"
                    }
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-slate-900">
                    {h.previous_status ? `${APPLICATION_STATUS_LABELS[h.previous_status]} → ${APPLICATION_STATUS_LABELS[h.new_status]}` : APPLICATION_STATUS_LABELS[h.new_status]}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(h.created_at)} · {h.changed_by === applicantId ? "You" : "Authorized personnel"}
                  </p>
                  {h.remarks ? <p className="mt-1 text-sm text-slate-600">{h.remarks}</p> : null}
                </li>
              ))}
            </ol>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
