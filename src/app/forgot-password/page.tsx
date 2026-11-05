import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { NotConfiguredNotice } from "@/components/auth/AuthNotice";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Forgot password" };

async function Content() {
  await connection();
  const configured = isSupabaseConfigured();
  return (
    <div className="space-y-6">
      {!configured ? <NotConfiguredNotice /> : null}
      <ForgotPasswordForm disabled={!configured} />
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will send you a link to choose a new password.">
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <Content />
      </Suspense>
    </AuthShell>
  );
}
