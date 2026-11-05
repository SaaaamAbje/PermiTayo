"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { forgotPasswordAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { Field, TextInput } from "@/components/ui/Field";
import { AuthNotice } from "./AuthNotice";
import { SubmitButton } from "./SubmitButton";

export function ForgotPasswordForm({ disabled }: { disabled?: boolean }) {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div className="space-y-5 text-center" role="status">
        <MailCheck className="mx-auto h-12 w-12 text-brand-600" aria-hidden="true" />
        <p className="text-sm text-slate-600">{state.message}</p>
        <Link href="/login" className="text-sm font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="space-y-5">
      {state.message ? <AuthNotice tone="error">{state.message}</AuthNotice> : null}
      <Field label="Email address" htmlFor="email" error={errors.email} required>
        <TextInput id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} aria-invalid={Boolean(errors.email)} disabled={disabled} />
      </Field>
      <SubmitButton pendingLabel="Sending link…" disabled={disabled}>
        Send reset link
      </SubmitButton>
      <p className="text-center text-sm text-slate-600">
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
