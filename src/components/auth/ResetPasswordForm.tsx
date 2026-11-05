"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { Field } from "@/components/ui/Field";
import { AuthNotice } from "./AuthNotice";
import { PasswordInput } from "./PasswordInput";
import { SubmitButton } from "./SubmitButton";

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-5">
      {state.message ? <AuthNotice tone="error">{state.message}</AuthNotice> : null}
      <Field label="New password" htmlFor="password" error={errors.password} hint="8+ characters, with a letter and a number." required>
        <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm} required>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} />
      </Field>
      <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
    </form>
  );
}
