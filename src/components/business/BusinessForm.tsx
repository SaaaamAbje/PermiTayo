"use client";

import { useActionState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { createBusinessAction, updateBusinessAction } from "@/lib/business/actions";
import { initialFormState } from "@/lib/auth/form-state";
import {
  ESTABLISHMENT_STATUSES,
  ESTABLISHMENT_STATUS_LABELS,
  OWNERSHIP_TYPES,
  OWNERSHIP_TYPE_LABELS,
} from "@/lib/business/constants";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Select, Textarea, TextInput } from "@/components/ui/Field";

export type BusinessFormValues = Record<string, string>;

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="grid gap-5 sm:grid-cols-2">{children}</CardBody>
    </Card>
  );
}

/**
 * Create or edit a business profile. Values are echoed back by the server on
 * error so nothing typed is lost. The owner is never a form field.
 */
export function BusinessForm({
  mode,
  initial,
  businessId,
  returnTo,
  cancelHref,
  today,
}: {
  mode: "create" | "edit";
  initial: BusinessFormValues;
  businessId?: string;
  returnTo?: "new-application";
  cancelHref: string;
  /** Today's date in Philippine time (YYYY-MM-DD), the latest allowed date established. */
  today: string;
}) {
  const [state, action, pending] = useActionState(mode === "create" ? createBusinessAction : updateBusinessAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  const v = (key: string) => state.values?.[key] ?? initial[key] ?? "";

  const text = (
    name: string,
    label: string,
    opts: { required?: boolean; hint?: string; type?: string; maxLength?: number; autoComplete?: string; inputMode?: "numeric" | "decimal" | "tel" | "email"; placeholder?: string; className?: string } = {},
  ) => (
    <Field label={label} htmlFor={name} error={errors[name]} required={opts.required} hint={opts.hint} className={opts.className}>
      <TextInput
        id={name}
        name={name}
        type={opts.type ?? "text"}
        defaultValue={v(name)}
        maxLength={opts.maxLength}
        autoComplete={opts.autoComplete ?? "off"}
        inputMode={opts.inputMode}
        placeholder={opts.placeholder}
        required={opts.required}
        aria-invalid={Boolean(errors[name])}
      />
    </Field>
  );

  return (
    <form action={action} noValidate className="space-y-6" aria-describedby="business-form-note">
      {businessId ? <input type="hidden" name="businessId" value={businessId} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <p id="business-form-note" className="text-sm text-slate-600">
        Fields marked <span className="text-red-600">*</span> are required. Saving a profile here does{" "}
        <strong>not</strong> register your business with any government office.
      </p>

      {state.message && !state.ok ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}

      <Section title="Basic information" description="As it appears on your registration documents.">
        {text("registeredBusinessName", "Registered business name", { required: true, maxLength: 200, className: "sm:col-span-2" })}
        {text("tradeName", "Trade name", { maxLength: 200, hint: "The name customers know, if different." })}
        {text("businessType", "Business type", { required: true, maxLength: 120, hint: "Describe it in your own words, for example Retail store." })}
        <Field label="Business category" htmlFor="businessCategory" error={errors.businessCategory} required hint="Use the category on your documents, if any.">
          <TextInput id="businessCategory" name="businessCategory" defaultValue={v("businessCategory")} maxLength={120} required aria-invalid={Boolean(errors.businessCategory)} />
        </Field>
        {text("businessEmail", "Business email", { type: "email", maxLength: 254, autoComplete: "email", inputMode: "email" })}
        {text("businessContactNumber", "Business contact number", { required: true, type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "0917 123 4567" })}
        <Field label="Business description" htmlFor="businessDescription" error={errors.businessDescription} className="sm:col-span-2">
          <Textarea id="businessDescription" name="businessDescription" defaultValue={v("businessDescription")} maxLength={1000} rows={3} aria-invalid={Boolean(errors.businessDescription)} />
        </Field>
      </Section>

      <Section title="Business address" description="Defaults to Rosario, Batangas. Change it if your address is different.">
        {text("province", "Province", { required: true, maxLength: 80 })}
        {text("municipality", "Municipality", { required: true, maxLength: 80 })}
        {text("barangay", "Barangay", { required: true, maxLength: 80 })}
        {text("zipCode", "ZIP code", { required: true, maxLength: 4, inputMode: "numeric", autoComplete: "postal-code" })}
        {text("streetAddress", "Street / house number", { maxLength: 200, autoComplete: "street-address", className: "sm:col-span-2" })}
      </Section>

      <Section title="Ownership information">
        <Field label="Ownership type" htmlFor="ownershipType" error={errors.ownershipType} required className="sm:col-span-2">
          <Select id="ownershipType" name="ownershipType" defaultValue={v("ownershipType")} required aria-invalid={Boolean(errors.ownershipType)}>
            <option value="" disabled>
              Select ownership type
            </option>
            {OWNERSHIP_TYPES.map((t) => (
              <option key={t} value={t}>
                {OWNERSHIP_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        {text("ownerFullName", "Owner's full name", { required: true, maxLength: 120, autoComplete: "name", className: "sm:col-span-2" })}
        {text("ownerEmail", "Owner's email", { type: "email", maxLength: 254, inputMode: "email" })}
        {text("ownerContactNumber", "Owner's contact number", { required: true, type: "tel", inputMode: "tel", placeholder: "0917 123 4567" })}
      </Section>

      <Section title="Business operation">
        <Field label="Nature of business" htmlFor="natureOfBusiness" error={errors.natureOfBusiness} required className="sm:col-span-2">
          <Textarea id="natureOfBusiness" name="natureOfBusiness" defaultValue={v("natureOfBusiness")} maxLength={300} rows={2} required aria-invalid={Boolean(errors.natureOfBusiness)} />
        </Field>
        {text("employeeCount", "Number of employees", { required: true, inputMode: "numeric", maxLength: 7, placeholder: "0" })}
        {text("estimatedCapital", "Estimated capital (PHP)", { inputMode: "decimal", maxLength: 20, placeholder: "50000.00" })}
        <Field label="Establishment status" htmlFor="establishmentStatus" error={errors.establishmentStatus} required>
          <Select id="establishmentStatus" name="establishmentStatus" defaultValue={v("establishmentStatus")} required aria-invalid={Boolean(errors.establishmentStatus)}>
            <option value="" disabled>
              Select status
            </option>
            {ESTABLISHMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ESTABLISHMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date established" htmlFor="dateEstablished" error={errors.dateEstablished} hint="If applicable.">
          <TextInput id="dateEstablished" name="dateEstablished" type="date" max={today} defaultValue={v("dateEstablished")} aria-invalid={Boolean(errors.dateEstablished)} />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
            </>
          ) : mode === "create" ? (
            "Save business profile"
          ) : (
            "Save changes"
          )}
        </Button>
        <Button href={cancelHref} variant="secondary" size="lg">
          Cancel
        </Button>
      </div>
    </form>
  );
}
