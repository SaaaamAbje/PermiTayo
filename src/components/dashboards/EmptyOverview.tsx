import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

type Stat = { label: string; icon: LucideIcon; accent?: "green" | "gold" | "red" | "slate" };

/**
 * Real overview for roles whose records arrive with permit processing.
 * No applications exist yet, so every figure is a true zero, not sample data.
 */
export function EmptyOverview({
  title,
  description,
  stats,
  emptyTitle,
  emptyText,
  action,
}: {
  title: string;
  description: string;
  stats: Stat[];
  emptyTitle: string;
  emptyText: string;
  action?: { href: string; label: string };
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value="0" icon={s.icon} accent={s.accent} />
        ))}
      </div>
      <Card className="mt-6">
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Inbox className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">{emptyTitle}</h2>
          <p className="max-w-md text-sm text-slate-600">{emptyText}</p>
          {action ? <Button href={action.href}>{action.label}</Button> : null}
        </CardBody>
      </Card>
    </>
  );
}
