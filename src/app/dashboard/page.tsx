import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { dashboardHref } from "@/lib/roles";

async function Router() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/unauthorized?reason=inactive");
  return redirect(dashboardHref(user.roleId));
}

// Sends each signed-in user to the dashboard for their role.
export default function DashboardIndex() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading…</p>}>
      <Router />
    </Suspense>
  );
}
