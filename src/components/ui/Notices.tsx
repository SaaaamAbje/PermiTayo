import { FlaskConical, Info, Sparkles, UserCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "./Badge";

/** Small tag placed beside any block that shows fictional data. */
export function DemoTag({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className}>
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Demo data
    </Badge>
  );
}

/** Inline notice used for features that arrive in a later phase. */
export function PhaseNotice({
  title = "Not connected yet",
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-sky-800">{children}</div>
      </div>
    </div>
  );
}

/**
 * Placeholder for AI-assisted suggestions. Always states that a person
 * keeps the final decision. No AI is connected in Phase 1.
 */
export function AiInsight({
  title,
  children,
  confidence,
  className,
}: {
  title: string;
  children: ReactNode;
  confidence?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-700 text-white">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
        <Badge tone="brand">AI-assisted · sample</Badge>
        {confidence ? <Badge tone="neutral">{confidence}</Badge> : null}
      </div>
      <div className="mt-3 text-sm leading-relaxed text-slate-700">{children}</div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Suggestion only. Authorized personnel make the final decision.
      </p>
    </div>
  );
}
