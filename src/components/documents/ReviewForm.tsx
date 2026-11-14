"use client";

import { useActionState, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { reviewDocumentAction } from "@/lib/documents/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { DOCUMENT_STATUS_LABELS, REVIEW_STATUSES, type ReviewStatus } from "@/lib/documents/constants";
import type { DocumentStatus } from "@/lib/database.types";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Field";

/** Manual review by BPLO personnel. The database records the reviewer and time. */
export function ReviewForm({ documentId, applicationId, current }: { documentId: string; applicationId: string; current: DocumentStatus }) {
  const [state, action, pending] = useActionState(reviewDocumentAction, initialFormState);
  const [status, setStatus] = useState<ReviewStatus | "">(current === "uploaded" ? "under_review" : "");
  const id = useId();
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="applicationId" value={applicationId} />
      <p className="text-sm font-semibold text-slate-900">Manual review</p>
      <Field label="Decision" htmlFor={`${id}-status`} error={errors.status} required>
        <Select id={`${id}-status`} name="status" value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus)} disabled={pending}>
          <option value="" disabled>
            Choose a decision
          </option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {DOCUMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={status === "needs_resubmission" ? "What the applicant needs to fix" : "Comment for the applicant (optional)"}
        htmlFor={`${id}-comment`}
        error={errors.comment}
        required={status === "needs_resubmission"}
        hint="The applicant will see this comment."
      >
        <Textarea id={`${id}-comment`} name="comment" maxLength={1000} rows={3} disabled={pending} defaultValue={state.ok ? "" : state.values?.comment} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || !status}>
          {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…</> : "Save review"}
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
