"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** Submit button with a loading state tied to the surrounding form action. */
export function SubmitButton({
  children,
  pendingLabel = "Please wait…",
  disabled,
  className,
  size = "lg",
}: {
  children: ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} disabled={pending || disabled} className={cn("w-full", className)} aria-busy={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
