import {
  ArrowRight,
  Bot,
  FileSearch,
  GitBranch,
  MapPin,
  MessageSquare,
  UserCheck,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { ROLE_ORDER, ROLES } from "@/lib/roles";

const features = [
  { icon: FileSearch, title: "Document processing", text: "Upload requirements once. AI reads them and flags what looks missing or unclear." },
  { icon: Bot, title: "Requirements verification", text: "Each document is checked against the checklist for your type of business." },
  { icon: GitBranch, title: "Departmental routing", text: "Applications are routed to the offices that need to review them." },
  { icon: MapPin, title: "Status tracking", text: "See which office has your application and what happens next." },
  { icon: MessageSquare, title: "Citizen inquiries", text: "Ask about fees, requirements and deadlines and get a clear answer." },
  { icon: UserCheck, title: "People decide", text: "AI recommends. Authorized government personnel hold final approval." },
];

const steps = [
  "Submit your application and documents",
  "AI pre-screens for completeness",
  "BPLO verifies and routes it",
  "Offices review in parallel",
  "Authorized official approves",
  "Release of your permit",
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="flex items-center gap-2">
            <Button href="/login" variant="ghost" size="sm">
              Sign in
            </Button>
            <Button href="/register" size="sm">
              Get started
            </Button>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-brand-900 text-white">
          <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-700/50" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-gold-400/10" aria-hidden="true" />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100">
              Municipality of Rosario, Batangas
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Apply for your business permit with clarity, not guesswork.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-brand-100">
              Permitayo uses agentic AI to help check your documents, route your application and
              answer your questions, while municipal personnel keep the final say.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/register" variant="gold" size="lg">
                Create an account <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                href="/login"
                size="lg"
                className="border border-white/30 bg-transparent text-white hover:bg-white/10"
              >
                Sign in
              </Button>
            </div>
          </div>
        </section>

        {/* Process */}
        <section aria-labelledby="process-heading" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="process-heading" className="text-2xl font-bold tracking-tight text-slate-900">
            How an application moves
          </h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-slate-800">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section aria-labelledby="features-heading" className="border-y border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="features-heading" className="text-2xl font-bold tracking-tight text-slate-900">
              What Permitayo will help with
            </h2>
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-xl border border-slate-200 p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Who uses it */}
        <section aria-labelledby="roles-heading" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="roles-heading" className="text-2xl font-bold tracking-tight text-slate-900">
            Who uses Permitayo
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Each person signs in and sees only what their role needs. Applicants register themselves.
            Municipal personnel accounts are created and managed by a system administrator.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROLE_ORDER.map((r) => (
              <li key={r} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
                <h3 className="font-semibold text-slate-900">{ROLES[r].label}</h3>
                <p className="mt-1 text-sm text-slate-600">{ROLES[r].tagline}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          Permitayo · Municipality of Rosario, Batangas.
        </div>
      </footer>
    </div>
  );
}
