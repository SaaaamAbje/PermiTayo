"use client";

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { initialFormState, type FormState } from "@/lib/auth/form-state";
import { Button } from "./Button";

type Variant = "primary" | "secondary" | "danger";

/**
 * A button that opens a confirmation dialog (native <dialog>, so focus is
 * trapped and Escape closes it). Confirming submits a server action with the
 * hidden fields and any extra inputs passed as children.
 */
export function ActionDialog({
  action,
  hidden,
  triggerLabel,
  triggerVariant = "secondary",
  title,
  description,
  confirmLabel,
  confirmVariant = "primary",
  pendingLabel = "Please wait…",
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  triggerLabel: string;
  triggerVariant?: Variant;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: Variant;
  pendingLabel?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (state.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <Button variant={triggerVariant} onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </Button>
      {state.ok && state.message ? (
        <p role="status" className="basis-full text-sm font-medium text-emerald-700">{state.message}</p>
      ) : null}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-raised backdrop:bg-slate-900/50"
      >
        <form action={formAction} className="space-y-4 p-6">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
          <div id={descId} className="text-sm text-slate-600">{description}</div>
          {children}
          {state.message && !state.ok ? (
            <p role="alert" className="text-sm font-medium text-red-600">{state.message}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => ref.current?.close()} disabled={pending}>
              Go back
            </Button>
            <Button type="submit" variant={confirmVariant} disabled={pending} aria-busy={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {pendingLabel}
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
