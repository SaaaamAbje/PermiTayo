import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/dal";
import { ROLES, type RoleId } from "@/lib/roles";
import { DashboardShell } from "./DashboardShell";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts).map((p) => p[0]);
  return letters.join("").slice(0, 2).toUpperCase() || "?";
}

/** Server component: verifies the session and role, then renders the shell with the real user. */
export async function ShellLoader({ role, children }: { role: RoleId; children: ReactNode }) {
  const user = await requireRole(role);
  const dept = user.departments.map((d) => d.code).join(", ");
  return (
    <DashboardShell
      role={role}
      user={{
        name: user.fullName,
        email: user.email,
        subtitle: dept ? `${ROLES[role].label} · ${dept}` : ROLES[role].label,
        initials: initialsOf(user.fullName),
      }}
    >
      {children}
    </DashboardShell>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-label="Loading dashboard">
      <div className="hidden w-64 bg-brand-900 lg:block" />
      <div className="flex-1 p-8">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-6 h-64 animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}
