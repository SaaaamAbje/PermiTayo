import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: AlertTriangle },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle },
} as const;

export function AuthNotice({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: ReactNode;
}) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-4 text-sm", box)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

/** Banner shown on auth pages when Supabase credentials are missing. */
export function NotConfiguredNotice() {
  return (
    <AuthNotice tone="warning" title="Supabase is not configured">
      Add <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
      <code className="rounded bg-amber-100 px-1">.env.local</code> and restart. Until then, sign-in and
      registration are disabled. See <code className="rounded bg-amber-100 px-1">docs/SETUP.md</code>.
    </AuthNotice>
  );
}
