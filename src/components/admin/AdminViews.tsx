import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  AUDIT_PAGE_SIZE,
  USERS_PAGE_SIZE,
  getUserDetail,
  listAuditLogs,
  listDepartments,
  listUsers,
} from "@/lib/admin/queries";
import { requireRole } from "@/lib/auth/dal";
import { userRoleFilter, userSearchSchema, userStatusFilter } from "@/lib/auth/schemas";
import type { AccountStatus, DbRole } from "@/lib/database.types";
import { DB_ROLE_LABELS, ALL_DB_ROLES } from "@/lib/roles";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Select, TextInput } from "@/components/ui/Field";
import { PhaseNotice } from "@/components/ui/Notices";
import { Pagination, parsePage } from "@/components/ui/Pagination";
import {
  AssignDepartmentForm,
  ChangeRoleForm,
  ChangeStatusForm,
  DepartmentToggle,
  RemoveAssignmentButton,
  STATUS_LABELS,
} from "./AdminForms";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const statusTone: Record<AccountStatus, BadgeTone> = { active: "success", pending: "info", inactive: "neutral", suspended: "danger" };
export const RoleBadge = ({ role }: { role: DbRole }) => (
  <Badge tone={role === "administrator" ? "brand" : "neutral"}>{DB_ROLE_LABELS[role]}</Badge>
);
export const StatusPill = ({ status }: { status: AccountStatus }) => <Badge tone={statusTone[status]}>{STATUS_LABELS[status]}</Badge>;

// ---------------------------------------------------------------------------
// User list
// ---------------------------------------------------------------------------
export async function AdminUsersView({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireRole("admin");
  const sp = await searchParams;

  const qParsed = userSearchSchema.safeParse(first(sp.q) ?? "");
  const q = qParsed.success ? qParsed.data : "";
  const roleParsed = userRoleFilter.safeParse(first(sp.role));
  const statusParsed = userStatusFilter.safeParse(first(sp.status));
  const role = roleParsed.success ? (roleParsed.data as DbRole) : undefined;
  const status = statusParsed.success ? statusParsed.data : undefined;
  const page = parsePage(first(sp.page));

  const { rows, total } = await listUsers({ q: q || undefined, role, status, page });
  const filtered = Boolean(q || role || status);

  return (
    <Card>
      <CardHeader title="Accounts" description={`${total} ${total === 1 ? "account" : "accounts"}${filtered ? " match your filters" : ""}`} />
      <form method="get" className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-[1fr_auto_auto_auto]" role="search" aria-label="Filter users">
        <div>
          <label htmlFor="q" className="sr-only">Search by name or email</label>
          <TextInput id="q" name="q" type="search" defaultValue={q} placeholder="Search by name or email" maxLength={80} />
        </div>
        <div>
          <label htmlFor="role-filter" className="sr-only">Filter by role</label>
          <Select id="role-filter" name="role" defaultValue={role ?? ""}>
            <option value="">All roles</option>
            {ALL_DB_ROLES.map((r) => <option key={r} value={r}>{DB_ROLE_LABELS[r]}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="status-filter" className="sr-only">Filter by status</label>
          <Select id="status-filter" name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as AccountStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="lg" className="h-11">Apply</Button>
          {filtered ? <Button href="/dashboard/admin/users" variant="secondary" size="lg" className="h-11">Clear</Button> : null}
        </div>
      </form>
      <DataTable
        caption="User accounts"
        rows={rows}
        rowKey={(r) => r.id}
        empty={filtered ? "No accounts match those filters." : "No accounts yet."}
        columns={[
          {
            key: "name",
            header: "Name",
            render: (r) => (
              <Link href={`/dashboard/admin/users/${r.id}`} className="font-medium text-brand-700 hover:underline">
                {r.full_name}
                {r.id === me.id ? <span className="ml-1.5 text-xs font-normal text-slate-500">(you)</span> : null}
                <span className="block text-xs font-normal text-slate-500">{r.email}</span>
              </Link>
            ),
          },
          { key: "role", header: "Role", render: (r) => <RoleBadge role={r.role} /> },
          { key: "dept", header: "Department", hideOnMobile: true, render: (r) => r.department_members.map((m) => m.departments?.department_code).filter(Boolean).join(", ") || <span className="text-slate-400">None</span> },
          { key: "status", header: "Status", render: (r) => <StatusPill status={r.account_status} /> },
          { key: "joined", header: "Registered", hideOnMobile: true, render: (r) => formatDate(r.created_at) },
        ]}
      />
      <Pagination base="/dashboard/admin/users" params={{ q: q || undefined, role, status }} page={page} total={total} size={USERS_PAGE_SIZE} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// User detail
// ---------------------------------------------------------------------------
export async function UserDetailView({ id }: { id: string }) {
  const me = await requireRole("admin");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [detail, departments] = await Promise.all([getUserDetail(id), listDepartments()]);
  if (!detail) notFound();
  const { profile, activity } = detail;
  const isSelf = profile.id === me.id;
  const isStaff = ["bplo_personnel", "department_personnel", "department_head"].includes(profile.role);
  const activeDepartments = departments.filter((d) => d.is_active).map((d) => ({ id: d.id, name: d.department_name, code: d.department_code }));

  return (
    <div className="space-y-6">
      <Link href="/dashboard/admin/users" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All accounts
      </Link>

      <Card>
        <CardHeader title={profile.full_name} description={profile.email} action={<div className="flex gap-2"><RoleBadge role={profile.role} /><StatusPill status={profile.account_status} /></div>} />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-500">Mobile number</dt><dd className="font-medium text-slate-900">{profile.phone_number ?? "Not provided"}</dd></div>
            <div><dt className="text-slate-500">Registered</dt><dd className="font-medium text-slate-900">{formatDateTime(profile.created_at)}</dd></div>
            <div><dt className="text-slate-500">Last profile update</dt><dd className="font-medium text-slate-900">{formatDateTime(profile.updated_at)}</dd></div>
            <div><dt className="text-slate-500">Privacy notice accepted</dt><dd className="font-medium text-slate-900">{profile.privacy_notice_accepted_at ? formatDate(profile.privacy_notice_accepted_at) : "No record"}</dd></div>
          </dl>
        </CardBody>
      </Card>

      {isSelf ? (
        <PhaseNotice title="This is your own account">
          For safety you cannot change your own role or status. Another administrator can do it for you.
        </PhaseNotice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Role" description="Takes effect immediately. Changes are recorded in the audit log." />
          <CardBody><ChangeRoleForm userId={profile.id} currentRole={profile.role} disabled={isSelf} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Account status" description="Inactive and suspended accounts cannot use the system." />
          <CardBody><ChangeStatusForm userId={profile.id} currentStatus={profile.account_status} disabled={isSelf} /></CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Department assignment" description="Only BPLO personnel, department personnel and department heads can be assigned." />
        <CardBody className="space-y-5">
          {profile.department_members.length === 0 ? (
            <p className="text-sm text-slate-600">Not assigned to any department.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {profile.department_members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium text-slate-900">{m.departments?.department_name}</span>{" "}
                    <span className="text-slate-500">({m.departments?.department_code})</span>
                    {m.department_position ? <span className="block text-xs text-slate-500">{m.department_position}</span> : null}
                  </span>
                  <RemoveAssignmentButton memberId={m.id} userId={profile.id} />
                </li>
              ))}
            </ul>
          )}
          {isStaff ? (
            <AssignDepartmentForm userId={profile.id} departments={activeDepartments} />
          ) : (
            <p className="text-sm text-slate-500">Change this user&apos;s role to a staff role to assign a department.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recent activity on this account" />
        {activity.length === 0 ? (
          <CardBody><p className="text-sm text-slate-600">No recorded activity yet.</p></CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <p className="text-slate-900">{a.description}</p>
                <p className="text-xs text-slate-500">{formatDateTime(a.created_at)} · {a.actor?.full_name ?? "Unknown user"}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------
export async function AdminDepartmentsView() {
  await requireRole("admin");
  const departments = await listDepartments();
  return (
    <div className="space-y-4">
      <PhaseNotice title="Proposed offices">
        These offices are proposals. Only activate the ones that take part in Rosario&apos;s permit process.
        Inactive offices cannot receive staff assignments.
      </PhaseNotice>
      <Card>
        <CardHeader title="Offices" />
        <DataTable
          caption="Departments"
          rows={departments}
          rowKey={(d) => d.id}
          empty="No departments yet."
          columns={[
            { key: "name", header: "Office", render: (d) => <span className="font-medium text-slate-900">{d.department_name}</span> },
            { key: "code", header: "Code", render: (d) => d.department_code },
            { key: "members", header: "Staff", hideOnMobile: true, render: (d) => d.department_members[0]?.count ?? 0 },
            { key: "status", header: "Status", render: (d) => <Badge tone={d.is_active ? "success" : "neutral"}>{d.is_active ? "Active" : "Inactive"}</Badge> },
            { key: "act", header: "", className: "text-right", render: (d) => <DepartmentToggle departmentId={d.id} active={d.is_active} /> },
          ]}
        />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export async function AdminAuditView({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const sp = await searchParams;
  const page = parsePage(first(sp.page));
  const { rows, total } = await listAuditLogs(page);
  return (
    <Card>
      <CardHeader title="Audit log" description="Newest first. Entries cannot be edited or deleted." />
      <DataTable
        caption="Audit log"
        rows={rows}
        rowKey={(r) => r.id}
        empty="Nothing has been recorded yet."
        columns={[
          { key: "when", header: "When", render: (r) => <span className="text-xs">{formatDateTime(r.created_at)}</span> },
          { key: "actor", header: "Actor", hideOnMobile: true, render: (r) => r.actor?.full_name ?? <span className="text-slate-400">Unknown</span> },
          { key: "what", header: "Activity", render: (r) => <><p className="font-medium text-slate-900">{r.description}</p><p className="font-mono text-xs text-slate-500">{r.action}</p></> },
        ]}
      />
      <Pagination base="/dashboard/admin/audit" params={{}} page={page} total={total} size={AUDIT_PAGE_SIZE} />
    </Card>
  );
}
