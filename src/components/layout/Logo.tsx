import Link from "next/link";
import { cn } from "@/lib/cn";

/** Permitayo wordmark with the official seal of the Municipality of Rosario, Batangas. */
export function Logo({
  href = "/",
  tone = "dark",
  className,
}: {
  href?: string;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label="Permitayo home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/seal.png"
        alt="Seal of the Municipality of Rosario, Batangas"
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-full bg-white"
      />
      <span className="leading-tight">
        <span
          className={cn(
            "block text-lg font-bold tracking-tight",
            tone === "dark" ? "text-brand-900" : "text-white",
          )}
        >
          Permitayo
        </span>
        <span
          className={cn(
            "block text-[11px] font-medium uppercase tracking-wider",
            tone === "dark" ? "text-slate-500" : "text-brand-200",
          )}
        >
          Rosario, Batangas
        </span>
      </span>
    </Link>
  );
}
