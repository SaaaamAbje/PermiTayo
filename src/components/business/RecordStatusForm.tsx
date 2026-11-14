"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { setBusinessRecordStatusAction } from "@/lib/business/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { RECORD_STATUSES, RECORD_STATUS_LABELS } from "@/lib/business/constants";
import type { BusinessRecordStatus } from "@/lib/database.types";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";

/** BPLO personnel and administrators set a profile's record status. Re-checked on the server and in the database. */
export function RecordStatusForm({ businessId, current }: { businessId: string; current: BusinessRecordStatus }) {
  const [state, action, pending] = useActionState(setBusinessRecordStatusAction, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="businessId" value={businessId} />
      <Field label="Record status" htmlFor="record-status" error={state.fieldErrors?.status}>
        <Select id="record-status" name="status" defaultValue={current} disabled={pending}>
          {RECORD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RECORD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
          </>
        ) : (
          "Update record status"
        )}
      </Button>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-red-600"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
