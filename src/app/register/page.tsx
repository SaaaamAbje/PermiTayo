import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { NotConfiguredNotice } from "@/components/auth/AuthNotice";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { isSupabaseConfigured } from "@/lib/env";
import { connection } from "next/server";

export const metadata: Metadata = { title: "Create account" };

async function RegisterContent() {
  await connection(); // read environment at request time, not build time
  const configured = isSupabaseConfigured();
  return (
    <div className="space-y-6">
      {!configured ? <NotConfiguredNotice /> : null}
      <RegisterForm disabled={!configured} />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell title="Create your applicant account" subtitle="Register once to apply for, renew and track your business permit.">
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <RegisterContent />
      </Suspense>
    </AuthShell>
  );
}
