import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";
import { dashboardHref } from "@/lib/roles";

export const metadata: Metadata = { title: "Access denied" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const { reason } = await searchParams;
  const user = await getCurrentUser();
  const inactive = reason === "inactive" || (user && user.status !== "active");

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-card">
      <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{inactive ? "Account not active" : "You can't open that page"}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {inactive
          ? "Your account is not currently active. Please contact the BPLO or a system administrator."
          : "Your account does not have permission to view this page."}
      </p>
      <div className="mt-6 flex flex-col gap-2">
        {user && !inactive ? <Button href={dashboardHref(user.roleId)}>Go to my dashboard</Button> : null}
        {user ? (
          <form action={signOutAction}>
            <SubmitButton size="md" pendingLabel="Signing out…" className="bg-white text-slate-800 border border-slate-300 hover:bg-slate-50">
              Sign out
            </SubmitButton>
          </form>
        ) : (
          <Button href="/login">Sign in</Button>
        )}
        <Link href="/" className="mt-1 text-sm font-medium text-brand-700 hover:underline">
          Back to home
        </Link>
      </div>
    </div>
  );
}

export default function UnauthorizedPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo />
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
