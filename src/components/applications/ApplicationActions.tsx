"use client";

import { cancelApplicationAction, deleteDraftAction } from "@/lib/applications/actions";
import { ActionDialog } from "@/components/ui/ActionDialog";
import { Field, Textarea } from "@/components/ui/Field";

export function CancelApplicationButton({ applicationId, isDraft }: { applicationId: string; isDraft: boolean }) {
  return (
    <ActionDialog
      action={cancelApplicationAction}
      hidden={{ applicationId }}
      triggerLabel="Cancel application"
      triggerVariant="secondary"
      title="Cancel this application?"
      description={
        isDraft
          ? "The draft will be marked as cancelled and kept in your records. It can no longer be edited or submitted."
          : "The application will be marked as cancelled. Its reference number and record are kept, and it cannot be reopened from here."
      }
      confirmLabel="Yes, cancel it"
      confirmVariant="danger"
      pendingLabel="Cancelling…"
    >
      <Field label="Reason (optional)" htmlFor={`reason-${applicationId}`} hint="Up to 500 characters.">
        <Textarea id={`reason-${applicationId}`} name="reason" maxLength={500} rows={3} />
      </Field>
    </ActionDialog>
  );
}

export function DeleteDraftButton({ applicationId }: { applicationId: string }) {
  return (
    <ActionDialog
      action={deleteDraftAction}
      hidden={{ applicationId }}
      triggerLabel="Delete draft"
      triggerVariant="danger"
      title="Delete this draft?"
      description="The draft and its history will be removed permanently. Only drafts can be deleted; submitted applications are always kept."
      confirmLabel="Delete draft"
      confirmVariant="danger"
      pendingLabel="Deleting…"
    />
  );
}
