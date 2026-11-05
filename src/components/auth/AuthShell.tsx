import type { ReactNode } from "react";
import { Bot, ShieldCheck, UserCheck } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

const points = [
  { icon: Bot, text: "AI assists with checking requirements and suggesting routing." },
  { icon: UserCheck, text: "Authorized municipal personnel always make the final decision." },
  { icon: ShieldCheck, text: "Track every step of your application in one place." },
];

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <aside className="relative order-2 hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/municipal-hall.png"
          alt="Municipal Hall of Rosario, Batangas"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/95 via-brand-900/70 to-brand-900/40" aria-hidden="true" />
        <Logo tone="light" className="relative" />
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Business permits, made clearer for Rosario.
          </h2>
          <ul className="mt-8 space-y-5">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-brand-100">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="pt-1.5 text-sm leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">
          Municipality of Rosario, Batangas · Business Permit and Licensing
        </p>
      </aside>

      <main id="main-content" className="order-1 flex flex-col bg-white">
        <div className="flex h-16 items-center px-6 lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
