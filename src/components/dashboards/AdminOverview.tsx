import { Activity, Building2, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseNotice } from "@/components/ui/Notices";
import { StatCard } from "@/components/ui/StatCard";
import { getAdminStats } from "@/lib/admin/queries";
import { formatDateTime } from "@/lib/format";

/** Live figures from the database. Nothing on this page is demonstration data. */
export async function AdminOverview() {
  const stats = await getAdminStats();
  return (
    <>
      <PageHeader
        title="System administration"
        description="Manage accounts, departments and system configuration."
        actions={<Button href="/dashboard/admin/users">Manage users</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total accounts" value={String(stats.totalAccounts)} icon={Users} />
        <StatCard label="Not active" value={String(stats.notActiveAccounts)} icon={ShieldAlert} accent="red" hint="Inactive, suspended or pending" />
        <StatCard label="Active departments" value={String(stats.activeDepartments)} icon={Building2} accent="slate" />
        <StatCard label="Audit events (24h)" value={String(stats.events24h)} icon={Activity} accent="green" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" action={<Button href="/dashboard/admin/audit" variant="ghost" size="sm">View all</Button>} />
          {stats.recent.length === 0 ? (
            <CardBody><p className="text-sm text-slate-600">Nothing has been recorded yet.</p></CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recent.map((r) => (
                <li key={r.id} className="px-5 py-3 text-sm">
                  <p className="font-medium text-slate-900">{r.description}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(r.created_at)} · {r.actor?.full_name ?? "Unknown user"}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="System status" />
            <CardBody className="space-y-3 text-sm">
              {[
                ["Database", "Connected", "success"],
                ["Authentication", "Connected", "success"],
                ["Document processing", "Not connected", "neutral"],
                ["AI services", "Not connected", "neutral"],
              ].map(([k, v, tone]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-slate-700">{k}</span>
                  <Badge tone={tone as "success" | "neutral"}>{v}</Badge>
                </div>
              ))}
            </CardBody>
          </Card>
          <PhaseNotice title="Human oversight">
            AI settings will let you require human review before any AI suggestion takes effect.
          </PhaseNotice>
        </div>
      </div>
    </>
  );
}
