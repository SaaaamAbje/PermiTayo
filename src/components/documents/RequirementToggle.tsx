"use client";

import { useActionState } from "react";
import { toggleRequirementAction } from "@/lib/documents/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { Button } from "@/components/ui/Button";

export function RequirementToggle({ requirementId, active, name }: { requirementId: string; active: boolean; name: string }) {
  const [state, action, pending] = useActionState(toggleRequirementAction, initialFormState);
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="requirementId" value={requirementId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending} aria-label={`${active ? "Deactivate" : "Activate"} ${name}`}>
        {pending ? "Saving…" : active ? "Deactivate" : "Activate"}
      </Button>
      {state.message && !state.ok ? <span role="alert" className="text-xs text-red-600">{state.message}</span> : null}
    </form>
  );
}
