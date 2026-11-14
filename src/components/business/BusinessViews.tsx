import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, FilePlus2, Pencil, Plus } from "lucide-react";
import {
  BUSINESSES_PAGE_SIZE,
  getBusinessForStaff,
  getMyBusiness,
  listBusinessApplications,
  listBusinessesForStaff,
  listMyBusinesses,
  type BusinessApplicationRow,
} from "@/lib/business/queries";
import { businessSearchSchema, recordStatusFilter } from "@/lib/business/schemas";
import {
  ESTABLISHMENT_STATUS_LABELS,
  OWNERSHIP_TYPE_LABELS,
  RECORD_STATUSES,
  RECORD_STATUS_LABELS,
  formatBusinessAddress,
  formatPeso,
} from "@/lib/business/constants";
import type { BusinessRecordStatus, EstablishmentStatus, OwnershipType } from "@/lib/database.types";
import { formatDate, formatDateTime } from "@/lib/format";
import type { RoleId } from "@/lib/roles";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Select, TextInput } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseNotice } from "@/components/ui/Notices";
import { Pagination, parsePage } from "@/components/ui/Pagination";
import { ApplicationStatusBadge, RecordStatusBadge } from "@/components/applications/StatusBadges";
import { RecordStatusForm } from "./RecordStatusForm";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const NOT_OFFICIAL =
  "A business profile in Permitayo is information you provide for your applications. It is not an official registration with any government office.";

function readFilters(sp: Record<string, string | string[] | undefined>) {
  const qParsed = businessSearchSchema.safeParse(first(sp.q) ?? "");
  const statusParsed = recordStatusFilter.safeParse(first(sp.status));
  return {
    q: qParsed.success ? qParsed.data : "",
    qInvalid: !qParsed.success,
    status: statusParsed.success ? (statusParsed.data as BusinessRecordStatus) : undefined,
  };
}

function FilterBar({ base, q, status, qInvalid }: { base: string; q: string; status?: string; qInvalid: boolean }) {
  const filtered = Boolean(q || status);
  return (
    <form method="get" role="search" aria-label="Filter business profiles" className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-[1fr_auto_auto]">
      <div>
        <label htmlFor="business-q" className="sr-only">Search by business name or reference number</label>
        <TextInput id="business-q" name="q" type="search" defaultValue={q} placeholder="Search name, trade name or reference" maxLength={80} aria-invalid={qInvalid} />
        {qInvalid ? <p role="alert" className="mt-1 text-xs text-red-600">Use letters, numbers, spaces, periods, apostrophes, ampersands or hyphens only.</p> : null}
      </div>
      <div>
        <label htmlFor="business-status" className="sr-only">Filter by record status</label>
        <Select id="business-status" name="status" defaultValue={status ?? ""}>
          <option value="">All record statuses</option>
          {RECORD_STATUSES.map((s) => (
            <option key={s} value={s}>{RECORD_STATUS_LABELS[s]}</option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="h-11">Apply</Button>
        {filtered ? <Button href={base} variant="secondary" size="lg" className="h-11">Clear</Button> : null}
      </div>
    </form>
  );
}

function SavedNotice({ saved }: { saved?: string }) {
  if (saved !== "created" && saved !== "updated") return null;
  return (
    <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
      {saved === "created" ? "Business profile saved. It is pending verification by the BPLO." : "Your changes were saved."}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Applicant: My Businesses
// ---------------------------------------------------------------------------
export async function MyBusinessesView({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { q, status, qInvalid } = readFilters(sp);
  const rows = await listMyBusinesses({ q: q || undefined, status });
  const filtered = Boolean(q || status);
  const base = "/dashboard/applicant/businesses";

  return (
    <>
      <PageHeader
        title="My Businesses"
        description="Business profiles you use when applying for a permit."
        actions={<Button href={`${base}/new`}><Plus className="h-4 w-4" aria-hidden="true" /> Register a business</Button>}
      />
      <PhaseNotice title="About business profiles" className="mb-6">{NOT_OFFICIAL}</PhaseNotice>
      <Card>
        <CardHeader title="Business profiles" description={`${rows.length} ${rows.length === 1 ? "profile" : "profiles"}${filtered ? " match your filters" : ""}`} />
        <FilterBar base={base} q={q} status={status} qInvalid={qInvalid} />
        {rows.length === 0 && !filtered ? (
          <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-slate-900">You have not registered a business yet</h2>
            <p className="max-w-md text-sm text-slate-600">Add your business details once, then use them for new, renewal and amendment applications.</p>
            <Button href={`${base}/new`}>Register a business</Button>
          </CardBody>
        ) : (
          <DataTable
            caption="Your business profiles"
            rows={rows}
            rowKey={(r) => r.id}
            empty="No business profiles match those filters."
            columns={[
              {
                key: "name",
                header: "Business",
                render: (r) => (
                  <Link href={`${base}/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.registered_business_name}
                    <span className="block text-xs font-normal text-slate-500">
                      {r.business_reference_number}
                      {r.trade_name ? ` · ${r.trade_name}` : ""}
                    </span>
                  </Link>
                ),
              },
              { key: "address", header: "Location", hideOnMobile: true, render: (r) => `${r.barangay}, ${r.municipality}` },
              { key: "apps", header: "Applications", hideOnMobile: true, render: (r) => String(r.permit_applications?.[0]?.count ?? 0) },
              { key: "status", header: "Record status", render: (r) => <RecordStatusBadge status={r.record_status} /> },
              {
                key: "actions",
                header: "Actions",
                className: "text-right",
                render: (r) => (
                  <span className="flex justify-end gap-2">
                    <Button href={`${base}/${r.id}`} variant="ghost" size="sm">View</Button>
                    {r.record_status !== "inactive" ? <Button href={`${base}/${r.id}/edit`} variant="ghost" size="sm">Edit</Button> : null}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared presentation of business details (live profile or submission snapshot)
// ---------------------------------------------------------------------------
export interface BusinessFieldsView {
  business_reference_number: string;
  registered_business_name: string;
  trade_name: string | null;
  business_description: string | null;
  business_type: string;
  ownership_type: OwnershipType;
  business_category: string;
  business_email: string | null;
  business_contact_number: string;
  province: string;
  municipality: string;
  barangay: string;
  street_address: string | null;
  zip_code: string;
  owner_full_name: string;
  owner_email: string | null;
  owner_contact_number: string;
  nature_of_business: string;
  employee_count: number;
  estimated_capital: number | string | null;
  establishment_status: EstablishmentStatus;
  date_established: string | null;
}

function Item({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words font-medium text-slate-900">{value || <span className="font-normal text-slate-400">Not provided</span>}</dd>
    </div>
  );
}

export function BusinessDetailsCards({ b }: { b: BusinessFieldsView }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Basic information" />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Registered business name" value={b.registered_business_name} wide />
            <Item label="Trade name" value={b.trade_name} />
            <Item label="Business type" value={b.business_type} />
            <Item label="Business category" value={b.business_category} />
            <Item label="Ownership type" value={OWNERSHIP_TYPE_LABELS[b.ownership_type]} />
            <Item label="Business email" value={b.business_email} />
            <Item label="Business contact number" value={b.business_contact_number} />
            <Item label="Description" value={b.business_description} wide />
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Address" />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Street / house number" value={b.street_address} wide />
            <Item label="Barangay" value={b.barangay} />
            <Item label="Municipality" value={b.municipality} />
            <Item label="Province" value={b.province} />
            <Item label="ZIP code" value={b.zip_code} />
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Owner" />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Full name" value={b.owner_full_name} wide />
            <Item label="Email" value={b.owner_email} />
            <Item label="Contact number" value={b.owner_contact_number} />
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Operation" />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Nature of business" value={b.nature_of_business} wide />
            <Item label="Number of employees" value={String(b.employee_count)} />
            <Item label="Estimated capital" value={formatPeso(b.estimated_capital)} />
            <Item label="Establishment status" value={ESTABLISHMENT_STATUS_LABELS[b.establishment_status]} />
            <Item label="Date established" value={b.date_established ? formatDate(`${b.date_established}T00:00:00+08:00`) : null} />
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

function ApplicationHistory({ rows, roleId }: { rows: BusinessApplicationRow[]; roleId: RoleId }) {
  return (
    <Card>
      <CardHeader title="Application history" description={roleId === "applicant" ? "Applications you have started for this business." : "Submitted applications for this business. Drafts are private to the applicant."} />
      <DataTable
        caption="Applications for this business"
        rows={rows}
        rowKey={(r) => r.id}
        empty="No applications for this business yet."
        columns={[
          {
            key: "ref",
            header: "Reference",
            render: (r) =>
              roleId === "applicant" ? (
                <Link href={`/dashboard/applicant/applications/${r.id}`} className="font-medium text-brand-700 hover:underline">
                  {r.reference_number ?? "Draft (no reference yet)"}
                </Link>
              ) : (
                <span className="font-medium text-slate-900">{r.reference_number ?? "Draft"}</span>
              ),
          },
          { key: "type", header: "Type", render: (r) => r.permit_types?.name ?? "" },
          { key: "submitted", header: "Submitted", hideOnMobile: true, render: (r) => (r.submitted_at ? formatDate(r.submitted_at) : "Not submitted") },
          { key: "status", header: "Status", render: (r) => <ApplicationStatusBadge status={r.application_status} /> },
        ]}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Business detail (applicant or staff)
// ---------------------------------------------------------------------------
export async function BusinessDetailView({ id, roleId, saved }: { id: string; roleId: RoleId; saved?: string }) {
  const isApplicant = roleId === "applicant";
  const business = isApplicant ? await getMyBusiness(id) : await getBusinessForStaff(id);
  if (!business) notFound();
  const history = await listBusinessApplications(business.id);
  const base = `/dashboard/${roleId}/businesses`;
  const editable = isApplicant && business.record_status !== "inactive";

  return (
    <div className="space-y-6">
      <Link href={base} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {isApplicant ? "My businesses" : "All business profiles"}
      </Link>
      <PageHeader
        title={business.registered_business_name}
        description={`Business reference ${business.business_reference_number}`}
        actions={
          isApplicant ? (
            <>
              {editable ? (
                <Button href={`${base}/${business.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</Button>
              ) : null}
              {editable ? (
                <Button href={`/dashboard/applicant/new-application?business=${business.id}`}><FilePlus2 className="h-4 w-4" aria-hidden="true" /> Start application</Button>
              ) : null}
            </>
          ) : null
        }
      />
      <SavedNotice saved={saved} />

      <Card>
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-500">Record status</dt><dd className="mt-1"><RecordStatusBadge status={business.record_status} /></dd></div>
            <div><dt className="text-slate-500">Business reference</dt><dd className="mt-0.5 font-medium text-slate-900">{business.business_reference_number}</dd></div>
            <div><dt className="text-slate-500">Created</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDateTime(business.created_at)}</dd></div>
            <div><dt className="text-slate-500">Last updated</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDateTime(business.updated_at)}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">{NOT_OFFICIAL}</p>
          {business.record_status === "inactive" && isApplicant ? (
            <p className="mt-2 text-sm text-slate-600">This profile is inactive, so it cannot be edited or used for new applications. Contact the BPLO if this is a mistake.</p>
          ) : null}
        </CardBody>
      </Card>

      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-800">Address:</span> {formatBusinessAddress(business)}
      </p>

      <BusinessDetailsCards b={business} />

      {!isApplicant ? (
        <Card>
          <CardHeader title="Record status" description="Pending Verification, Active or Inactive. Inactive profiles cannot be edited or used for new applications. Changes are audited." />
          <CardBody><RecordStatusForm businessId={business.id} current={business.record_status} /></CardBody>
        </Card>
      ) : null}

      <ApplicationHistory rows={history} roleId={roleId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BPLO personnel and administrators: business profile search
// ---------------------------------------------------------------------------
export async function StaffBusinessesView({ roleId, searchParams }: { roleId: RoleId; searchParams: SearchParams }) {
  const sp = await searchParams;
  const { q, status, qInvalid } = readFilters(sp);
  const page = parsePage(first(sp.page));
  const { rows, total } = await listBusinessesForStaff({ q: q || undefined, status, page });
  const filtered = Boolean(q || status);
  const base = `/dashboard/${roleId}/businesses`;

  return (
    <>
      <PageHeader title="Business Profiles" description="Search business profiles registered by applicants and set their record status." />
      <Card>
        <CardHeader title="Profiles" description={`${total} ${total === 1 ? "profile" : "profiles"}${filtered ? " match your filters" : ""}`} />
        <FilterBar base={base} q={q} status={status} qInvalid={qInvalid} />
        <DataTable
          caption="Business profiles"
          rows={rows}
          rowKey={(r) => r.id}
          empty={filtered ? "No business profiles match those filters." : "No business profiles have been registered yet."}
          columns={[
            {
              key: "name",
              header: "Business",
              render: (r) => (
                <Link href={`${base}/${r.id}`} className="font-medium text-brand-700 hover:underline">
                  {r.registered_business_name}
                  <span className="block text-xs font-normal text-slate-500">{r.business_reference_number}{r.trade_name ? ` · ${r.trade_name}` : ""}</span>
                </Link>
              ),
            },
            { key: "owner", header: "Owner", hideOnMobile: true, render: (r) => r.owner_full_name },
            { key: "location", header: "Location", hideOnMobile: true, render: (r) => `${r.barangay}, ${r.municipality}` },
            { key: "status", header: "Record status", render: (r) => <RecordStatusBadge status={r.record_status} /> },
            { key: "created", header: "Registered", hideOnMobile: true, render: (r) => formatDate(r.created_at) },
          ]}
        />
        <Pagination base={base} params={{ q: q || undefined, status }} page={page} total={total} size={BUSINESSES_PAGE_SIZE} />
      </Card>
    </>
  );
}
