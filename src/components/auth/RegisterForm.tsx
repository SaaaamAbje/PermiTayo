"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { registerAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { AuthNotice } from "./AuthNotice";
import { PasswordInput } from "./PasswordInput";
import { SubmitButton } from "./SubmitButton";

export function RegisterForm({ disabled }: { disabled?: boolean }) {
  const [state, action] = useActionState(registerAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div className="space-y-5 text-center" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden="true" />
        <h2 className="text-xl font-bold text-slate-900">Almost done</h2>
        <p className="text-sm text-slate-600">{state.message}</p>
        <Button href="/login" variant="secondary">
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="space-y-5">
      {state.message ? <AuthNotice tone="error">{state.message}</AuthNotice> : null}

      <Field label="Full name" htmlFor="fullName" error={errors.fullName} required>
        <TextInput id="fullName" name="fullName" autoComplete="name" defaultValue={state.values?.fullName} aria-invalid={Boolean(errors.fullName)} disabled={disabled} />
      </Field>
      <Field label="Email address" htmlFor="email" error={errors.email} required>
        <TextInput id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} aria-invalid={Boolean(errors.email)} disabled={disabled} />
      </Field>
      <Field label="Mobile number" htmlFor="phone" error={errors.phone} hint="For status updates." required>
        <TextInput id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0917 123 4567" defaultValue={state.values?.phone} aria-invalid={Boolean(errors.phone)} disabled={disabled} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Password" htmlFor="password" error={errors.password} hint="8+ characters, with a letter and a number." required>
          <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} disabled={disabled} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm} required>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} disabled={disabled} />
        </Field>
      </div>

      <div>
        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input type="checkbox" name="privacy" id="privacy" className="mt-0.5 h-4 w-4 rounded accent-brand-700" disabled={disabled} aria-invalid={Boolean(errors.privacy)} />
          <span>
            I have read the{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-brand-700 underline">
              privacy notice
            </Link>{" "}
            and understand that Permitayo uses AI to assist processing while municipal personnel make
            the final decisions.
          </span>
        </label>
        {errors.privacy ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
            {errors.privacy}
          </p>
        ) : null}
      </div>

      <SubmitButton pendingLabel="Creating account…" disabled={disabled}>
        Create account
      </SubmitButton>

      <p className="text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
      <p className="text-center text-xs text-slate-500">
        Registration is for business owners and applicants only. Municipal personnel accounts are
        created by a system administrator.
      </p>
    </form>
  );
}
