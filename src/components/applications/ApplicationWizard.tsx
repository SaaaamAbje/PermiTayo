"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { saveApplicationAction } from "@/lib/applications/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { OWNERSHIP_TYPE_LABELS, RECORD_STATUS_LABELS, formatBusinessAddress } from "@/lib/business/constants";
import type { BusinessRecordStatus, OwnershipType } from "@/lib/database.types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Select, Textarea, TextInput } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Progress";

export interface WizardBusiness {
  id: string;
  business_reference_number: string;
  registered_business_name: string;
  trade_name: string | null;
  ownership_type: OwnershipType;
  business_type: string;
  business_category: string;
  nature_of_business: string;
  street_address: string | null;
  barangay: string;
  municipality: string;
  province: string;
  zip_code: string;
  owner_full_name: string;
  business_contact_number: string;
  record_status: BusinessRecordStatus;
}

export interface WizardPermitType {
  id: string;
  name: string;
  description: string | null;
}

export interface WizardValues {
  businessId: string;
  permitTypeId: string;
  businessName: string;
  businessAddress: string;
  natureOfBusiness: string;
  businessCategory: string;
  applicantRemarks: string;
}

const STEPS = ["Select business", "Application information", "Review", "Save or submit"] as const;

/** Which step each field lives on (used to jump to the first error). */
const FIELD_STEP: Record<string, number> = {
  businessId: 0,
  permitTypeId: 1,
  businessName: 1,
  businessAddress: 1,
  natureOfBusiness: 1,
  businessCategory: 1,
  applicantRemarks: 1,
  declaration: 3,
};

function prefillFrom(b: WizardBusiness): Pick<WizardValues, "businessName" | "businessAddress" | "natureOfBusiness" | "businessCategory"> {
  return {
    businessName: b.registered_business_name,
    businessAddress: formatBusinessAddress(b),
    natureOfBusiness: b.nature_of_business,
    businessCategory: b.business_category,
  };
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="whitespace-pre-line break-words text-sm font-medium text-slate-900 sm:col-span-2">
        {value?.trim() ? value : <span className="font-normal text-slate-400">Not provided</span>}
      </dd>
    </div>
  );
}

/**
 * Four-step permit application form. All steps live in one <form>, so a draft
 * can be saved from any step. Nothing here decides status or reference
 * numbers: the server and database do.
 */
export function ApplicationWizard({
  businesses,
  permitTypes,
  applicant,
  initial,
  applicationId: initialApplicationId,
  cancelHref,
}: {
  businesses: WizardBusiness[];
  permitTypes: WizardPermitType[];
  applicant: { fullName: string; email: string; phone: string | null };
  initial: WizardValues;
  applicationId?: string;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState(saveApplicationAction, initialFormState);
  const [step, setStep] = useState(() => (initial.businessId ? 1 : 0));
  const [values, setValues] = useState<WizardValues>(initial);
  const [declared, setDeclared] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitDialog = useRef<HTMLDialogElement>(null);
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const formId = useId();

  const errors = state.fieldErrors ?? {};
  const applicationId = state.values?.applicationId || initialApplicationId || "";
  const business = businesses.find((b) => b.id === values.businessId);
  const permitType = permitTypes.find((t) => t.id === values.permitTypeId);

  // After a server response with field errors, show the first step that has one.
  // Runs only when the action state changes, so it cannot loop.
  useEffect(() => {
    submitDialog.current?.close();
    const keys = Object.keys(state.fieldErrors ?? {});
    if (keys.length > 0) {
      const target = Math.min(...keys.map((k) => FIELD_STEP[k] ?? 0));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a completed server action
      setStep(target);
    }
  }, [state]);

  // Move focus to the step heading when the step changes (not on first render).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const set = (key: keyof WizardValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function chooseBusiness(id: string) {
    const b = businesses.find((x) => x.id === id);
    setValues((v) => (b && v.businessId !== id ? { ...v, businessId: id, ...prefillFrom(b) } : { ...v, businessId: id }));
    setStepError(null);
  }

  function validateStep(i: number): string | null {
    if (i === 0 && !business) return "Select a business profile to continue.";
    if (i === 1) {
      if (!permitType) return "Choose an application type.";
      const missing = [
        ["business name", values.businessName],
        ["business address", values.businessAddress],
        ["nature of business", values.natureOfBusiness],
        ["business category", values.businessCategory],
      ]
        .filter(([, v]) => !v.trim())
        .map(([l]) => l);
      if (missing.length) return `Fill in the ${missing.join(", ")}. You can also save this as a draft and finish later.`;
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    setStepError(err);
    if (!err) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function openSubmit() {
    for (let i = 0; i < 2; i += 1) {
      const err = validateStep(i);
      if (err) {
        setStep(i);
        setStepError(err);
        return;
      }
    }
    if (!declared) {
      setStepError("Confirm the declaration before submitting.");
      return;
    }
    setStepError(null);
    submitDialog.current?.showModal();
  }

  const canSaveDraft = Boolean(business && permitType);

  return (
    <form id={formId} action={action} noValidate className="space-y-6">
      {applicationId ? <input type="hidden" name="applicationId" value={applicationId} /> : null}
      <input type="hidden" name="businessId" value={values.businessId} />
      <input type="hidden" name="permitTypeId" value={values.permitTypeId} />
      <input type="hidden" name="businessName" value={values.businessName} />
      <input type="hidden" name="businessAddress" value={values.businessAddress} />
      <input type="hidden" name="natureOfBusiness" value={values.natureOfBusiness} />
      <input type="hidden" name="businessCategory" value={values.businessCategory} />
      <input type="hidden" name="applicantRemarks" value={values.applicantRemarks} />
      {declared ? <input type="hidden" name="declaration" value="on" /> : null}

      <Card>
        <CardBody>
          <Stepper steps={STEPS} currentIndex={step} />
        </CardBody>
      </Card>

      {state.message && !state.ok ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}

      <Card>
        <CardHeader title={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`} />
        <CardBody className="space-y-5">
          <h2 ref={headingRef} tabIndex={-1} className="sr-only">
            {`Step ${step + 1}: ${STEPS[step]}`}
          </h2>

          {/* Step 1: select business ------------------------------------------------ */}
          <div hidden={step !== 0} className="space-y-4">
            {businesses.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 py-10 text-center">
                <Building2 className="h-8 w-8 text-brand-600" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-900">You need a business profile first</p>
                <p className="max-w-sm text-sm text-slate-600">Register your business details once. You will come back here afterwards.</p>
                <Button href="/dashboard/applicant/businesses/new?returnTo=new-application">Register a business</Button>
              </div>
            ) : (
              <>
                <fieldset>
                  <legend className="mb-3 text-sm font-medium text-slate-800">
                    Which business is this application for? <span className="text-red-600" aria-hidden="true">*</span>
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {businesses.map((b) => {
                      const selected = b.id === values.businessId;
                      return (
                        <label
                          key={b.id}
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-lg border p-4 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-200",
                            selected ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50",
                          )}
                        >
                          <input
                            type="radio"
                            name="businessChoice"
                            value={b.id}
                            checked={selected}
                            onChange={() => chooseBusiness(b.id)}
                            className="mt-1 h-4 w-4 accent-brand-700"
                          />
                          <span>
                            <span className="block font-semibold text-slate-900">{b.registered_business_name}</span>
                            <span className="block text-xs text-slate-500">
                              {b.business_reference_number}
                              {b.trade_name ? ` · ${b.trade_name}` : ""}
                            </span>
                            <span className="mt-1 block text-xs text-slate-600">{b.barangay}, {b.municipality}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {errors.businessId ? <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errors.businessId}</p> : null}
                </fieldset>
                <Link href="/dashboard/applicant/businesses/new?returnTo=new-application" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Register another business
                </Link>
                {business ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
                    <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Confirm business details</p>
                    <dl className="divide-y divide-slate-200">
                      <Row label="Registered name" value={business.registered_business_name} />
                      <Row label="Business reference" value={business.business_reference_number} />
                      <Row label="Ownership type" value={OWNERSHIP_TYPE_LABELS[business.ownership_type]} />
                      <Row label="Owner" value={business.owner_full_name} />
                      <Row label="Address" value={formatBusinessAddress(business)} />
                      <Row label="Record status" value={RECORD_STATUS_LABELS[business.record_status]} />
                    </dl>
                    <p className="pb-2 text-xs text-slate-500">
                      Something wrong?{" "}
                      <Link href={`/dashboard/applicant/businesses/${business.id}/edit`} className="font-medium text-brand-700 hover:underline">
                        Edit this business profile
                      </Link>{" "}
                      first (unsaved changes here will be lost).
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Step 2: application information ---------------------------------------- */}
          <div hidden={step !== 1} className="grid gap-5 sm:grid-cols-2">
            <Field label="Application type" htmlFor="permitTypeSelect" error={errors.permitTypeId} required className="sm:col-span-2" hint={permitType?.description ?? undefined}>
              <Select id="permitTypeSelect" value={values.permitTypeId} onChange={set("permitTypeId")} aria-invalid={Boolean(errors.permitTypeId)}>
                <option value="" disabled>
                  Select application type
                </option>
                {permitTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Business name" htmlFor="businessNameInput" error={errors.businessName} required className="sm:col-span-2" hint="Prefilled from your business profile.">
              <TextInput id="businessNameInput" value={values.businessName} onChange={set("businessName")} maxLength={200} aria-invalid={Boolean(errors.businessName)} />
            </Field>
            <Field label="Business address" htmlFor="businessAddressInput" error={errors.businessAddress} required className="sm:col-span-2">
              <Textarea id="businessAddressInput" value={values.businessAddress} onChange={set("businessAddress")} maxLength={400} rows={2} aria-invalid={Boolean(errors.businessAddress)} />
            </Field>
            <Field label="Nature of business" htmlFor="natureInput" error={errors.natureOfBusiness} required>
              <TextInput id="natureInput" value={values.natureOfBusiness} onChange={set("natureOfBusiness")} maxLength={300} aria-invalid={Boolean(errors.natureOfBusiness)} />
            </Field>
            <Field label="Business category" htmlFor="categoryInput" error={errors.businessCategory} required>
              <TextInput id="categoryInput" value={values.businessCategory} onChange={set("businessCategory")} maxLength={120} aria-invalid={Boolean(errors.businessCategory)} />
            </Field>
            <Field label="Remarks for the BPLO (optional)" htmlFor="remarksInput" error={errors.applicantRemarks} className="sm:col-span-2" hint="Up to 1,000 characters.">
              <Textarea id="remarksInput" value={values.applicantRemarks} onChange={set("applicantRemarks")} maxLength={1000} rows={3} aria-invalid={Boolean(errors.applicantRemarks)} />
            </Field>
          </div>

          {/* Step 3: review ---------------------------------------------------------- */}
          <div hidden={step !== 2} className="space-y-6">
            <section aria-labelledby="review-applicant">
              <div className="flex items-center justify-between">
                <h3 id="review-applicant" className="text-sm font-semibold text-slate-900">Applicant</h3>
                <Link href="/dashboard/applicant/profile" className="text-xs font-medium text-brand-700 hover:underline">Update in My Profile</Link>
              </div>
              <dl className="mt-1 divide-y divide-slate-100">
                <Row label="Full name" value={applicant.fullName} />
                <Row label="Email" value={applicant.email} />
                <Row label="Mobile number" value={applicant.phone} />
              </dl>
            </section>
            <section aria-labelledby="review-business">
              <div className="flex items-center justify-between">
                <h3 id="review-business" className="text-sm font-semibold text-slate-900">Business profile</h3>
                <button type="button" onClick={() => setStep(0)} className="text-xs font-medium text-brand-700 hover:underline">Change</button>
              </div>
              <dl className="mt-1 divide-y divide-slate-100">
                <Row label="Registered name" value={business?.registered_business_name} />
                <Row label="Business reference" value={business?.business_reference_number} />
                <Row label="Ownership type" value={business ? OWNERSHIP_TYPE_LABELS[business.ownership_type] : null} />
                <Row label="Business type" value={business?.business_type} />
                <Row label="Contact number" value={business?.business_contact_number} />
              </dl>
            </section>
            <section aria-labelledby="review-application">
              <div className="flex items-center justify-between">
                <h3 id="review-application" className="text-sm font-semibold text-slate-900">Application</h3>
                <button type="button" onClick={() => setStep(1)} className="text-xs font-medium text-brand-700 hover:underline">Edit</button>
              </div>
              <dl className="mt-1 divide-y divide-slate-100">
                <Row label="Application type" value={permitType?.name} />
                <Row label="Business name" value={values.businessName} />
                <Row label="Business address" value={values.businessAddress} />
                <Row label="Nature of business" value={values.natureOfBusiness} />
                <Row label="Business category" value={values.businessCategory} />
                <Row label="Remarks" value={values.applicantRemarks} />
              </dl>
            </section>
            <section aria-labelledby="review-privacy" className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <h3 id="review-privacy" className="font-semibold">Privacy notice</h3>
              <p className="mt-1 text-sky-800">
                The details in this application are used by the Municipality of Rosario to process your business permit. They are
                visible to you and to authorized municipal personnel, and actions on your application are recorded. AI may later
                assist personnel, but authorized personnel make the final decision. Read the full{" "}
                <Link href="/privacy" target="_blank" className="font-medium underline">privacy notice</Link>.
              </p>
            </section>
            <p className="text-sm text-slate-600">Document upload is not available yet. You will be able to add your requirements in a later step.</p>
          </div>

          {/* Step 4: save or submit -------------------------------------------------- */}
          <div hidden={step !== 3} className="space-y-4 text-sm text-slate-700">
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Save as draft</strong> keeps your application private. You can edit, submit or delete it later.</li>
              <li><strong>Submit application</strong> sends it to the BPLO and gives it an official reference number. After submitting you can no longer change it.</li>
              <li><strong>Cancel</strong> leaves this page without saving your latest changes.</li>
            </ul>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
              <input
                type="checkbox"
                checked={declared}
                onChange={(e) => {
                  setDeclared(e.target.checked);
                  setStepError(null);
                }}
                className="mt-0.5 h-4 w-4 accent-brand-700"
                aria-invalid={Boolean(errors.declaration)}
              />
              <span>
                I confirm that the information in this application is true and accurate to the best of my knowledge, and that I
                have read the privacy notice.
              </span>
            </label>
            {errors.declaration ? <p role="alert" className="text-xs font-medium text-red-600">{errors.declaration}</p> : null}
          </div>

          {stepError ? <p role="alert" className="text-sm font-medium text-red-600">{stepError}</p> : null}
        </CardBody>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {step > 0 ? <Button variant="secondary" onClick={back} disabled={pending}>Back</Button> : null}
            <Button variant="ghost" onClick={() => cancelDialog.current?.showModal()} disabled={pending}>Cancel</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending || !canSaveDraft} title={canSaveDraft ? undefined : "Select a business and an application type first"}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Save as draft
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={pending || businesses.length === 0}>Next</Button>
            ) : (
              <Button onClick={openSubmit} disabled={pending}>Submit application</Button>
            )}
          </div>
        </div>
      </Card>

      <dialog ref={submitDialog} aria-labelledby={`${formId}-submit-title`} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-raised backdrop:bg-slate-900/50">
        <h2 id={`${formId}-submit-title`} className="text-lg font-semibold text-slate-900">Submit this application?</h2>
        <p className="mt-2 text-sm text-slate-600">
          Once submitted, it receives an official reference number and you can no longer edit it. Any correction will need to go through
          the BPLO.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => submitDialog.current?.close()} disabled={pending}>Go back</Button>
          <Button type="submit" form={formId} name="intent" value="submit" disabled={pending} aria-busy={pending}>
            {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Submitting…</> : "Yes, submit"}
          </Button>
        </div>
      </dialog>

      <dialog ref={cancelDialog} aria-labelledby={`${formId}-cancel-title`} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-raised backdrop:bg-slate-900/50">
        <h2 id={`${formId}-cancel-title`} className="text-lg font-semibold text-slate-900">Leave without saving?</h2>
        <p className="mt-2 text-sm text-slate-600">Changes you have not saved as a draft will be lost. Saved drafts are kept.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => cancelDialog.current?.close()}>Keep editing</Button>
          <Button href={cancelHref} variant="danger">Leave this page</Button>
        </div>
      </dialog>
    </form>
  );
}
