import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Accent = "brand" | "gold" | "green" | "red" | "slate";

const accents: Record<Accent, string> = {
  brand: "bg-brand-50 text-brand-700",
  gold: "bg-gold-100 text-gold-600",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-700",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "brand",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: Accent;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            accents[accent],
          )}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {hint ? <p className="mt-3 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
