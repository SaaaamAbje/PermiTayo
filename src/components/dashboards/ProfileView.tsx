"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateProfileAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-5">
      <Field label="Full name" htmlFor="fullName" error={errors.fullName} required>
        <TextInput id="fullName" name="fullName" autoComplete="name" defaultValue={state.values?.fullName ?? fullName} aria-invalid={Boolean(errors.fullName)} />
      </Field>
      <Field label="Mobile number" htmlFor="phone" error={errors.phone} hint="Leave blank to remove it.">
        <TextInput id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0917 123 4567" defaultValue={state.values?.phone ?? phone} aria-invalid={Boolean(errors.phone)} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…</> : "Save changes"}
        </Button>
        {state.message ? (
          <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-red-600"}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
