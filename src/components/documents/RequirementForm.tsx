"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { createRequirementAction, updateRequirementAction } from "@/lib/documents/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { DOCUMENT_MIME_TYPES, MIME_LABELS } from "@/lib/documents/constants";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Select, Textarea, TextInput } from "@/components/ui/Field";

export interface RequirementFormValues {
  name: string;
  description: string;
  applicantInstructions: string;
  isRequired: "required" | "optional";
  acceptedFileTypes: string[];
  maxFileSizeMb: string;
  displayOrder: string;
  isActive: boolean;
}

/** Create or edit a permit requirement (BPLO personnel and administrators). */
export function RequirementForm({
  mode,
  initial,
  permitTypes,
  permitTypeId,
  requirementId,
  cancelHref,
}: {
  mode: "create" | "edit";
  initial: RequirementFormValues;
  permitTypes: { id: string; name: string }[];
  permitTypeId: string;
  requirementId?: string;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState(mode === "create" ? createRequirementAction : updateRequirementAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  const echoed = state.values;
  const v = <K extends keyof RequirementFormValues>(k: K): string =>
    echoed && k in echoed ? (echoed[k] as string) : String(initial[k] ?? "");
  const types = echoed?.acceptedFileTypes !== undefined ? echoed.acceptedFileTypes.split(",").filter(Boolean) : initial.acceptedFileTypes;
  const active = echoed ? echoed.isActive === "on" : initial.isActive;

  return (
    <form action={action} noValidate className="space-y-6">
      {requirementId ? <input type="hidden" name="requirementId" value={requirementId} /> : null}
      {state.message && !state.ok ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.message}</p>
      ) : null}
      <Card>
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Field label="Permit type" htmlFor="permitTypeId" error={errors.permitTypeId} required className="sm:col-span-2" hint={mode === "edit" ? "The permit type of an existing requirement cannot be changed." : undefined}>
            {mode === "create" ? (
              <Select id="permitTypeId" name="permitTypeId" defaultValue={echoed?.permitTypeId ?? permitTypeId} required>
                {permitTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            ) : (
              <TextInput id="permitTypeId" value={permitTypes.find((t) => t.id === permitTypeId)?.name ?? ""} disabled readOnly />
            )}
          </Field>
          <Field label="Requirement name" htmlFor="name" error={errors.name} required className="sm:col-span-2">
            <TextInput id="name" name="name" defaultValue={v("name")} maxLength={160} required aria-invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Description" htmlFor="description" error={errors.description} className="sm:col-span-2" hint="What this document is.">
            <Textarea id="description" name="description" defaultValue={v("description")} maxLength={1000} rows={2} />
          </Field>
          <Field label="Instructions for applicants" htmlFor="applicantInstructions" error={errors.applicantInstructions} className="sm:col-span-2" hint="How to prepare and upload it, in plain language.">
            <Textarea id="applicantInstructions" name="applicantInstructions" defaultValue={v("applicantInstructions")} maxLength={1000} rows={3} />
          </Field>
          <Field label="Required or optional" htmlFor="isRequired" error={errors.isRequired} required>
            <Select id="isRequired" name="isRequired" defaultValue={v("isRequired")}>
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </Select>
          </Field>
          <Field label="Display order" htmlFor="displayOrder" error={errors.displayOrder} required hint="Lower numbers appear first.">
            <TextInput id="displayOrder" name="displayOrder" inputMode="numeric" defaultValue={v("displayOrder")} maxLength={5} aria-invalid={Boolean(errors.displayOrder)} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-slate-800">
              Accepted file formats <span className="text-red-600" aria-hidden="true">*</span>
            </legend>
            <div className="flex flex-wrap gap-4">
              {DOCUMENT_MIME_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="acceptedFileTypes" value={t} defaultChecked={types.includes(t)} className="h-4 w-4 accent-brand-700" />
                  {MIME_LABELS[t]}
                </label>
              ))}
            </div>
            {errors.acceptedFileTypes ? <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.acceptedFileTypes}</p> : null}
          </fieldset>
          <Field label="Maximum file size (MB)" htmlFor="maxFileSizeMb" error={errors.maxFileSizeMb} required hint="Between 0.1 and 10 MB. Default 5 MB.">
            <TextInput id="maxFileSizeMb" name="maxFileSizeMb" inputMode="decimal" defaultValue={v("maxFileSizeMb")} maxLength={4} aria-invalid={Boolean(errors.maxFileSizeMb)} />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-3 text-sm text-slate-700">
              <input type="checkbox" name="isActive" value="on" defaultChecked={active} className="h-4 w-4 accent-brand-700" />
              Active (shown to applicants)
            </label>
          </div>
        </CardBody>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…</> : mode === "create" ? "Add requirement" : "Save changes"}
        </Button>
        <Button href={cancelHref} variant="secondary" size="lg">Cancel</Button>
      </div>
    </form>
  );
}
