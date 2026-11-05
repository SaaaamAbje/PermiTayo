import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TimelineEvent } from "@/lib/application-status";

export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}
    >
      <div
        className={cn(
          "h-full rounded-full",
          clamped === 100 ? "bg-emerald-500" : "bg-brand-600",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Horizontal stepper for the six permit workflow stages. */
export function Stepper({
  steps,
  currentIndex,
}: {
  steps: readonly string[];
  currentIndex: number;
}) {
  return (
    <ol className="grid gap-4 sm:grid-flow-col sm:auto-cols-fr sm:gap-2">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li
            key={step}
            aria-current={current ? "step" : undefined}
            className="flex items-center gap-3 sm:flex-col sm:items-center sm:text-center"
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                done && "border-emerald-500 bg-emerald-500 text-white",
                current && "border-brand-600 bg-brand-600 text-white ring-4 ring-brand-100",
                !done && !current && "border-slate-300 bg-white text-slate-400",
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium sm:mt-1",
                current ? "text-brand-800" : done ? "text-slate-700" : "text-slate-400",
              )}
            >
              {step}
              <span className="sr-only">
                {done ? " (completed)" : current ? " (current step)" : " (upcoming)"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-6 border-l-2 border-slate-200 pl-6">
      {events.map((e) => (
        <li key={e.title} className="relative">
          <span
            className={cn(
              "absolute -left-[33px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white",
              e.state === "done" && "border-emerald-500 bg-emerald-500",
              e.state === "current" && "border-brand-600 ring-4 ring-brand-100",
              e.state === "upcoming" && "border-slate-300",
            )}
            aria-hidden="true"
          />
          <p
            className={cn(
              "text-sm font-semibold",
              e.state === "upcoming" ? "text-slate-400" : "text-slate-900",
            )}
          >
            {e.title}
          </p>
          <p className="text-xs text-slate-500">
            {e.office} · {e.when}
          </p>
          {e.note ? <p className="mt-1 text-sm text-slate-600">{e.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** Simple horizontal bars (CSS only). Used for demo charts. */
export function BarList({
  items,
  unit = "",
}: {
  items: { label: string; value: number }[];
  unit?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-900">
              {item.value}
              {unit}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
