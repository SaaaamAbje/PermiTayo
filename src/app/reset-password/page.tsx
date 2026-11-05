import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Choose a new password" };

async function Content() {
  // The reset link signs the visitor in with a short-lived recovery session.
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-5">
        <AuthNotice tone="warning" title="This link has expired or was already used">
          Request a new password reset link to continue.
        </AuthNotice>
        <Link href="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" subtitle="Use a password you do not use anywhere else.">
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <Content />
      </Suspense>
    </AuthShell>
  );
}
