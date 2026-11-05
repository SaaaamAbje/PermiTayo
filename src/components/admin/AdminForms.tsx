"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import {
  assignDepartmentAction,
  changeRoleAction,
  changeStatusAction,
  removeAssignmentAction,
  setDepartmentActiveAction,
} from "@/lib/admin/actions";
import { initialFormState, type FormState } from "@/lib/auth/form-state";
import { DB_ROLE_LABELS, ALL_DB_ROLES } from "@/lib/roles";
import type { AccountStatus, DbRole } from "@/lib/database.types";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";

export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  pending: "Pending",
};

function Feedback({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-red-600"}>
      {state.message}
    </p>
  );
}

function Pending({ pending, label }: { pending: boolean; label: string }) {
  return pending ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
    </>
  ) : (
    <>{label}</>
  );
}

export function ChangeRoleForm({ userId, currentRole, disabled }: { userId: string; currentRole: DbRole; disabled?: boolean }) {
  const [state, action, pending] = useActionState(changeRoleAction, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <Field label="Role" htmlFor="role" error={state.fieldErrors?.role}>
        <Select id="role" name="role" defaultValue={currentRole} disabled={disabled || pending}>
          {ALL_DB_ROLES.map((r) => (
            <option key={r} value={r}>
              {DB_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="md" disabled={disabled || pending}>
        <Pending pending={pending} label="Change role" />
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function ChangeStatusForm({ userId, currentStatus, disabled }: { userId: string; currentStatus: AccountStatus; disabled?: boolean }) {
  const [state, action, pending] = useActionState(changeStatusAction, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <Field label="Account status" htmlFor="status" error={state.fieldErrors?.status}>
        <Select id="status" name="status" defaultValue={currentStatus} disabled={disabled || pending}>
          {(Object.keys(STATUS_LABELS) as AccountStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" size="md" disabled={disabled || pending}>
        <Pending pending={pending} label="Update status" />
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function AssignDepartmentForm({
  userId,
  departments,
  disabled,
}: {
  userId: string;
  departments: { id: string; name: string; code: string }[];
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(assignDepartmentAction, initialFormState);
  if (departments.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No active departments yet. Activate the participating offices under Departments first.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <Field label="Department" htmlFor="departmentId" error={state.fieldErrors?.departmentId}>
        <Select id="departmentId" name="departmentId" defaultValue="" disabled={disabled || pending}>
          <option value="" disabled>
            Select a department
          </option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.code})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Position (optional)" htmlFor="position" error={state.fieldErrors?.position}>
        <TextInput id="position" name="position" maxLength={80} placeholder="For example, Reviewer" disabled={disabled || pending} />
      </Field>
      <Button type="submit" size="md" disabled={disabled || pending}>
        <Pending pending={pending} label="Assign to department" />
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function RemoveAssignmentButton({ memberId, userId }: { memberId: string; userId: string }) {
  const [state, action, pending] = useActionState(removeAssignmentAction, initialFormState);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </Button>
      {state.message && !state.ok ? <span role="alert" className="text-xs text-red-600">{state.message}</span> : null}
    </form>
  );
}

export function DepartmentToggle({ departmentId, active }: { departmentId: string; active: boolean }) {
  const [state, action, pending] = useActionState(setDepartmentActiveAction, initialFormState);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" size="sm" variant={active ? "secondary" : "primary"} disabled={pending}>
        {pending ? "Saving…" : active ? "Deactivate" : "Activate"}
      </Button>
      {state.message && !state.ok ? <span role="alert" className="text-xs text-red-600">{state.message}</span> : null}
    </form>
  );
}
