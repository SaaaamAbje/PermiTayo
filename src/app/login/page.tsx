import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthNotice, NotConfiguredNotice } from "@/components/auth/AuthNotice";
import { LoginForm } from "@/components/auth/LoginForm";
import { isSupabaseConfigured } from "@/lib/env";
import { safeInternalPath } from "@/lib/auth/form-state";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const next = safeInternalPath(first(params.next), "");

  let notice: { tone: "info" | "success" | "error" | "warning"; text: string } | null = null;
  if (first(params.reason) === "expired") notice = { tone: "warning", text: "Your session has expired. Please sign in again." };
  else if (first(params.confirmed)) notice = { tone: "success", text: "Email confirmed. You can now sign in." };
  else if (first(params.signedout)) notice = { tone: "info", text: "You have been signed out." };
  else if (first(params.error) === "link-invalid") notice = { tone: "error", text: "That link is invalid or has expired. Please try again." };

  return (
    <div className="space-y-6">
      {!configured ? <NotConfiguredNotice /> : null}
      {notice ? <AuthNotice tone={notice.tone}>{notice.text}</AuthNotice> : null}
      <LoginForm next={next || undefined} disabled={!configured} />
    </div>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage or process business permit applications.">
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
