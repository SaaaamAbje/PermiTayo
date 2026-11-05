import type { Metadata } from "next";
import { Logo } from "@/components/layout/Logo";
import { AuthNotice } from "@/components/auth/AuthNotice";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-900">Privacy notice</h1>
      <div className="mt-4">
        <AuthNotice tone="warning" title="Draft for review">
          This is a working draft. The Municipality of Rosario, Batangas, and its Data
          Protection Officer must review and replace it before Permitayo is used with real applicants.
        </AuthNotice>
      </div>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-700">
        <p>
          <strong>What we collect at registration:</strong> your full name, email address, mobile number and
          password. Your password is handled by the authentication service and is never stored by
          Permitayo in readable form.
        </p>
        <p>
          <strong>Why:</strong> to create your applicant account, let you apply for and track a business permit,
          and contact you about your application.
        </p>
        <p>
          <strong>Who can see it:</strong> you can see and update your own details. Authorized municipal
          personnel and system administrators can see account information needed to do their work.
          Administrative actions on accounts are recorded in an audit log.
        </p>
        <p>
          <strong>AI assistance:</strong> later versions of Permitayo will use AI to help check documents, suggest
          routing and answer questions. AI only makes suggestions. Authorized government personnel keep the
          final decision on every application.
        </p>
        <p>
          <strong>Your choices:</strong> you can update your name and mobile number in your profile. Requests
          about your data should go to the municipality&apos;s Data Protection Officer once contact details are
          published here.
        </p>
      </div>
    </div>
  );
}
