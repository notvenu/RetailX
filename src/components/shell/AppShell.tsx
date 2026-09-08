"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { navFor, NAV_GROUPS } from "@/lib/nav";
import type { Role } from "@/lib/users";
import { ORG } from "@/lib/mock";
import { doSignOut } from "@/app/(app)/actions";

type SessionUser = {
  name: string;
  email: string;
  role: Role;
  title: string;
};

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const nav = navFor(user.role);

  return (
    <div className="flex min-h-screen bg-paper">
      {/* backdrop */}
      {drawer && (
        <button
          aria-label="Close menu"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-rule bg-panel transition-transform lg:static lg:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <span className="text-[1.05rem] font-bold tracking-[-0.03em] text-ink">
            Retail<span className="text-accent">X</span>
          </span>
          <button
            onClick={() => setDrawer(false)}
            className="rounded-[3px] p-1 text-ink-soft hover:bg-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mx-5 border-t border-rule pt-3">
          <p className="text-[0.78rem] font-medium text-ink">{ORG.name}</p>
          <p className="text-[0.7rem] text-ink-faint">{user.role} workspace</p>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((group) => {
            const items = nav.filter((n) => n.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mb-5">
                <p className="px-2.5 pb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  {group}
                </p>
                <ul>
                  {items.map((item) => {
                    const active =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href} className="relative">
                        {active && (
                          <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
                        )}
                        <Link
                          href={item.href}
                          onClick={() => setDrawer(false)}
                          className={`flex items-center gap-2.5 rounded-[3px] px-2.5 py-[7px] text-[0.82rem] transition-colors ${
                            active
                              ? "bg-white font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
                              : "text-ink-soft hover:bg-white/70 hover:text-ink"
                          }`}
                        >
                          <Icon
                            className={`size-4 shrink-0 ${active ? "text-accent" : "text-ink-faint"}`}
                            strokeWidth={1.75}
                          />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <p className="border-t border-rule px-5 py-3 text-[0.68rem] leading-relaxed text-ink-faint">
          Prototype · all figures are sample data
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-rule bg-paper px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawer(true)}
              className="rounded-[3px] p-1.5 text-ink-soft hover:bg-panel lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <p className="text-[0.78rem] text-ink-soft">
              As of <span className="font-medium text-ink">{ORG.asOf}</span>
              <span className="mx-2 text-rule-strong">·</span>
              {ORG.fiscalYear}
            </p>
          </div>
          <UserMenu user={user} />
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-7 sm:px-6 lg:px-10">
          <div className="rx-rise">{children}</div>
        </main>
      </div>
    </div>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-left hover:bg-panel"
      >
        <span className="grid size-7 place-items-center rounded-full bg-accent-wash text-[0.72rem] font-semibold text-accent">
          {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[0.8rem] font-medium text-ink">{user.name}</span>
          <span className="block text-[0.68rem] text-ink-faint">{user.role}</span>
        </span>
        <ChevronDown className="size-4 text-ink-faint" />
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-60 rounded-[5px] border border-rule bg-white p-1 shadow-overlay">
            <div className="px-3 py-2">
              <p className="text-[0.8rem] font-medium text-ink">{user.name}</p>
              <p className="text-[0.72rem] text-ink-soft">{user.title}</p>
              <p className="mt-0.5 text-[0.72rem] text-ink-faint">{user.email}</p>
            </div>
            <div className="my-1 border-t border-rule" />
            <form action={doSignOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-[3px] px-3 py-1.5 text-[0.8rem] text-ink-soft hover:bg-panel hover:text-ink"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
