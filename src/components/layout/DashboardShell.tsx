"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { dashboardHref, ROLES, type RoleId } from "@/lib/roles";
import { signOutAction } from "@/lib/auth/actions";
import { iconMap } from "./icons";
import { Logo } from "./Logo";

export interface ShellUser {
  name: string;
  email: string;
  /** Short line under the name, for example the role or assigned department. */
  subtitle: string;
  initials: string;
}

export function DashboardShell({
  role,
  user,
  children,
}: {
  role: RoleId;
  user: ShellUser;
  children: ReactNode;
}) {
  const config = ROLES[role];
  const pathname = usePathname();
  // The drawer is "open for" a specific path, so it closes automatically on navigation.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const setMenuOpen = (open: boolean) => setMenuPath(open ? pathname : null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const isActive = (slug: string) => {
    const href = dashboardHref(role, slug);
    return slug === "" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };

  const sidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo tone="light" href={dashboardHref(role)} />
      </div>
      <div className="mx-3 rounded-lg bg-white/10 px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-brand-200">Signed in as</p>
        <p className="text-sm font-semibold text-white">{config.label}</p>
      </div>
      <nav aria-label={`${config.label} navigation`} className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {config.nav.map((item) => {
            const Icon = iconMap[item.icon];
            const active = isActive(item.slug);
            return (
              <li key={item.slug || "overview"}>
                <Link
                  href={dashboardHref(role, item.slug)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-white/10 p-3">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-100 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-900 lg:block">{sidebarBody}</aside>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-brand-900 shadow-raised">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-brand-100 hover:bg-white/10"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarBody}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{config.label}</p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">{config.tagline}</p>
          </div>

          <button
            type="button"
            className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Notifications (none connected yet)"
          >
            <Bell className="h-5 w-5" />
          </button>

          <Link
            href={dashboardHref(role, "profile")}
            className="flex items-center gap-2.5 rounded-lg border-l border-slate-200 pl-3 hover:opacity-80"
            aria-label={`My profile: ${user.name}`}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
              aria-hidden="true"
            >
              {user.initials}
            </span>
            <span className="hidden leading-tight md:block">
              <span className="block max-w-48 truncate text-sm font-medium text-slate-900">{user.name}</span>
              <span className="block max-w-48 truncate text-xs text-slate-500">{user.subtitle}</span>
            </span>
          </Link>
        </header>

        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
