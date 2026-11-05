"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { Field, TextInput } from "@/components/ui/Field";
import { AuthNotice } from "./AuthNotice";
import { PasswordInput } from "./PasswordInput";
import { SubmitButton } from "./SubmitButton";

export function LoginForm({ next, disabled }: { next?: string; disabled?: boolean }) {
  const [state, action] = useActionState(signInAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-5">
      {state.message ? <AuthNotice tone="error">{state.message}</AuthNotice> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="Email address" htmlFor="email" error={errors.email} required>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          placeholder="you@example.com"
          aria-invalid={Boolean(errors.email)}
          disabled={disabled}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={errors.password} required>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          disabled={disabled}
        />
      </Field>

      <div className="text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">
          Forgot password?
        </Link>
      </div>

      <SubmitButton pendingLabel="Signing in…" disabled={disabled}>
        Sign in
      </SubmitButton>

      <p className="text-center text-sm text-slate-600">
        Applying for a permit?{" "}
        <Link href="/register" className="font-semibold text-brand-700 hover:underline">
          Create an applicant account
        </Link>
      </p>
    </form>
  );
}
