"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-card" role="alert">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          We couldn&apos;t load this page. Try again. If it keeps happening, contact a system administrator.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button href="/dashboard" variant="secondary">
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
