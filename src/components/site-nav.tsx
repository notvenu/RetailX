"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

export function SiteNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const linkClass = (href: string) =>
    pathname === href
      ? "text-ink underline decoration-accent decoration-2 underline-offset-[7px]"
      : "text-ink-soft hover:text-ink";

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-7 text-[0.88rem] md:flex">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={linkClass(l.href)}>
            {l.label}
          </Link>
        ))}
        <span aria-hidden className="h-4 w-px bg-rule-strong" />
        <Link href="/login" className="text-ink-soft hover:text-ink">
          Sign in
        </Link>
        <Link
          href="/login"
          className="rounded-[4px] bg-accent px-3.5 py-2 font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
        >
          Open the demo
        </Link>
      </nav>

      {/* native disclosure on small screens: no JS state to manage */}
      <details className="group relative md:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[4px] border border-rule-strong px-3 py-1.5 text-[0.85rem] text-ink [&::-webkit-details-marker]:hidden">
          <Menu className="size-4" strokeWidth={1.75} />
          Menu
        </summary>
        <nav
          aria-label="Main"
          className="absolute right-0 z-20 mt-2 flex w-56 flex-col rounded-[4px] border border-rule bg-paper p-2 text-[0.92rem] shadow-overlay"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`rounded-[3px] px-3 py-2 ${pathname === l.href ? "bg-accent-wash text-accent" : "text-ink hover:bg-panel"}`}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="mt-1 rounded-[3px] bg-accent px-3 py-2 text-center font-medium text-white">
            Open the demo
          </Link>
        </nav>
      </details>
    </>
  );
}
