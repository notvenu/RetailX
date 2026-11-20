"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Barcode, Bell, BookOpen, Lightbulb, Scale, ScanBarcode, Vault, Bot, Building2, CheckCheck, ChevronDown, ClipboardCheck, FileText, LayoutGrid, LineChart, LogOut, Menu, Plus,
  Settings, ShieldCheck, Workflow, X,
} from "lucide-react";
import { savePrefs, signoutAction } from "@/app/actions";
import { ago } from "@/lib/format";
import { LANGS } from "@/lib/i18n";
import type { Lang } from "@/lib/model";
import { Icon } from "@/components/icon";
import { LangProvider, useT } from "@/components/lang";
import { orAlert } from "@/lib/result";

export type NavItem = { href: string; label: string; icon: string; group: string; badge?: number };
export type Notice = { id: string; at: string; text: string; href: string };
type ShellUser = { name: string; role: string; identifier: string };

const BUILTIN: Record<string, typeof LayoutGrid> = {
  dashboard: LayoutGrid, analytics: Activity, forecasting: LineChart, ai: Bot, automations: Workflow, tasks: ClipboardCheck,
  settings: Settings, approvals: CheckCheck, reports: FileText, planner: Building2, market: Scale,
  pos: ScanBarcode, dayclose: Vault, labels: Barcode, insights: Lightbulb, books: BookOpen,
};

export function AppShell(props: {
  business: { name: string; tagline: string };
  user: ShellUser;
  nav: NavItem[];
  side: "left" | "right";
  lang: Lang;
  notices: Notice[];
  unread: number;
  quickModules: { id: string; name: string; icon: string }[];
  children: React.ReactNode;
}) {
  return (
    <LangProvider lang={props.lang}>
      <Shell {...props} />
    </LangProvider>
  );
}

function Shell({ business, user, nav, side, lang, notices, unread, quickModules, children }: Parameters<typeof AppShell>[0]) {
  const [drawer, setDrawer] = useState(false);
  const [quick, setQuick] = useState(false);
  const pathname = usePathname();
  const tr = useT();
  const groups = [...new Set(nav.map((n) => n.group))];
  const right = side === "right";

  return (
    <div className={`flex min-h-screen bg-paper ${right ? "lg:flex-row-reverse" : ""}`}>
      {drawer && <button aria-label="Close menu" onClick={() => setDrawer(false)} className="fixed inset-0 z-30 bg-ink/20 lg:hidden" />}

      <aside
        className={`fixed inset-y-0 z-40 flex w-60 flex-col print:hidden border-rule bg-panel transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          right ? "right-0 border-l" : "left-0 border-r"
        } ${drawer ? "translate-x-0" : right ? "translate-x-full" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <Link href="/dashboard" className="text-[1.05rem] font-bold tracking-[-0.03em] text-ink">Retail<span className="text-accent">X</span></Link>
          <button onClick={() => setDrawer(false)} className="rounded-sm p-1 text-ink-soft hover:bg-surface lg:hidden" aria-label="Close menu"><X className="size-4" /></button>
        </div>
        <div className="mx-5 border-t border-rule pt-3">
          <p className="truncate text-[0.8rem] font-medium text-ink">{business.name}</p>
          <p className="truncate text-[0.7rem] text-ink-faint">{business.tagline}</p>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group} className="mb-5">
              <p className="px-2.5 pb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">{group}</p>
              <ul>
                {nav.filter((n) => n.group === group).map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Builtin = BUILTIN[item.icon];
                  return (
                    <li key={item.href} className="relative">
                      {active && <span className={`absolute top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent ${right ? "right-0" : "left-0"}`} />}
                      <Link
                        href={item.href}
                        onClick={() => setDrawer(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2.5 rounded-sm px-2.5 py-[7px] text-[0.82rem] transition-colors ${
                          active ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)]" : "text-ink-soft hover:bg-surface/70 hover:text-ink"
                        }`}
                      >
                        <span className={active ? "text-accent" : "text-ink-faint"}>
                          {Builtin ? <Builtin className="size-4 shrink-0" strokeWidth={1.75} /> : <Icon name={item.icon} className="size-4 shrink-0" />}
                        </span>
                        <span className="truncate">{item.label}</span>
                        {item.badge ? <span className="ml-auto rounded-full bg-accent-wash px-1.5 text-[0.68rem] font-semibold text-accent">{item.badge}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 print:hidden items-center justify-between gap-4 border-b border-rule bg-paper/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setDrawer(true)} className="rounded-sm p-1.5 text-ink-soft hover:bg-panel lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
            <p suppressHydrationWarning className="text-[0.78rem] text-ink-soft">
              {new Date().toLocaleDateString(lang === "en" ? "en-GB" : `${lang}-IN`, { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Bells notices={notices} unread={unread} />
            <UserMenu user={user} lang={lang} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-7 pb-24 sm:px-6 lg:px-10 lg:pb-7 print:max-w-none print:p-0">
          <div className="rx-rise">{children}</div>
        </main>
      </div>

      {/* phones: one thumb away from recording something */}
      {quickModules.length ? (
        <>
          <button onClick={() => setQuick(true)} aria-label={tr("nav.quick")}
            className="fixed bottom-5 right-5 z-30 grid size-14 print:hidden place-items-center rounded-full bg-accent text-white shadow-overlay lg:hidden">
            <Plus className="size-6" />
          </button>
          {quick ? (
            <div className="fixed inset-0 z-50 flex items-end bg-ink/30 lg:hidden" onClick={() => setQuick(false)}>
              <div role="dialog" aria-label={tr("nav.quick")} className="w-full rounded-t-lg bg-surface p-4 pb-8" onClick={(e) => e.stopPropagation()}>
                <p className="mb-3 text-[0.9rem] font-semibold text-ink">{tr("nav.quick")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {quickModules.map((m) => (
                    <Link key={m.id} href={`/m/${m.id}?add=1`} onClick={() => setQuick(false)}
                      className="flex flex-col items-center gap-1.5 rounded-md border border-rule p-3 text-center text-[0.78rem] text-ink active:bg-panel">
                      <Icon name={m.icon} className="size-5 text-accent" />{m.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Bells({ notices, unread }: { notices: Notice[]; unread: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unread);
  useEffect(() => setCount(unread), [unread]);
  const [, start] = useTransition();
  const tr = useT();
  return (
    <div className="relative">
      <button aria-label={`${tr("shell.notifications")}${count ? ` (${count})` : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="relative rounded-sm p-2 text-ink-soft hover:bg-panel">
        <Bell className="size-[18px]" />
        {count ? <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[0.6rem] font-semibold leading-4 text-white">{count > 9 ? "9+" : count}</span> : null}
      </button>
      {open ? (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-md border border-rule bg-surface shadow-overlay">
            <div className="flex items-center justify-between border-b border-rule px-3 py-2">
              <span className="text-[0.8rem] font-semibold text-ink">{tr("shell.notifications")}</span>
              {count ? (
                <button className="text-[0.74rem] text-accent hover:underline"
                  onClick={() => { setCount(0); start(async () => { await orAlert(savePrefs({ seenAt: new Date().toISOString() })); }); }}>{tr("shell.markread")}</button>
              ) : null}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {notices.length ? notices.map((n) => (
                <li key={n.id}>
                  {/^https?:/.test(n.href) ? (
                    <a href={n.href} target="_blank" rel="noreferrer" className="block px-3 py-2 text-[0.78rem] text-ink-soft hover:bg-panel">{n.text}</a>
                  ) : (
                    <Link href={n.href} onClick={() => setOpen(false)} className="block px-3 py-2 text-[0.78rem] text-ink-soft hover:bg-panel">
                      {n.text}<span suppressHydrationWarning className="mt-0.5 block text-[0.68rem] text-ink-faint">{ago(n.at)}</span>
                    </Link>
                  )}
                </li>
              )) : <li className="px-3 py-6 text-center text-[0.78rem] text-ink-faint">{tr("shell.nothing")}</li>}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function UserMenu({ user, lang }: { user: ShellUser; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const tr = useT();
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-panel">
        <span className="grid size-7 place-items-center rounded-full bg-accent-wash text-[0.72rem] font-semibold text-accent">
          {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[0.8rem] font-medium text-ink">{user.name}</span>
          <span className="block text-[0.68rem] text-ink-faint">{user.role}</span>
        </span>
        <ChevronDown className="size-4 text-ink-faint" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-rule bg-surface p-1 shadow-overlay">
            <div className="px-3 py-2">
              <p className="text-[0.8rem] font-medium text-ink">{user.name}</p>
              <p className="text-[0.72rem] text-ink-soft">{user.role}</p>
              <p className="mt-0.5 truncate text-[0.72rem] text-ink-faint">{user.identifier}</p>
            </div>
            <div className="my-1 border-t border-rule" />
            <label className="flex items-center justify-between gap-2 px-3 py-1.5 text-[0.8rem] text-ink-soft">
              {tr("shell.language")}
              <select value={lang} onChange={(e) => start(async () => { await orAlert(savePrefs({ lang: e.target.value as Lang })); })}
                className="rounded-sm border border-rule-strong bg-surface px-1.5 py-0.5 text-[0.78rem] text-ink">
                {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-sm px-3 py-1.5 text-[0.8rem] text-ink-soft hover:bg-panel hover:text-ink">
              <ShieldCheck className="size-4" /> {tr("shell.profile")}
            </Link>
            <form action={signoutAction} onSubmit={() => { void globalThis.caches?.delete("rx-pos-v1"); }}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-[0.8rem] text-ink-soft hover:bg-panel hover:text-ink">
                <LogOut className="size-4" /> {tr("shell.signout")}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
