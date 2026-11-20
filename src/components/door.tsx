"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { btnPrimary } from "@/components/ui";

/** Shared frame for sign-in and sign-up: a cover on the left, the form on the right. */
export function Door({ title, sub, cover, children }: { title: string; sub: ReactNode; cover: { heading: string; points: { k: string; v: string }[] }; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-panel px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-md border border-rule bg-surface shadow-overlay lg:grid-cols-[1fr_1.05fr]">
        <div className="hidden flex-col bg-panel p-10 lg:flex">
          <Link href="/" className="self-start text-[1.4rem] font-bold tracking-[-0.03em] text-ink">
            Retail<span className="text-accent">X</span>
          </Link>
          <h1 className="mt-6 text-[1.35rem] font-semibold leading-snug tracking-[-0.02em] text-ink">{cover.heading}</h1>
          <dl className="mt-auto space-y-3 border-t border-rule pt-5">
            {cover.points.map((g) => (
              <div key={g.k} className="grid grid-cols-[6.5rem_1fr] gap-3 text-[0.78rem]">
                <dt className="font-semibold uppercase tracking-[0.1em] text-ink-faint">{g.k}</dt>
                <dd className="text-ink-soft">{g.v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="p-8 sm:p-10">
          <Link href="/" className="mb-6 inline-block text-[1.2rem] font-bold tracking-[-0.03em] text-ink lg:hidden">
            Retail<span className="text-accent">X</span>
          </Link>
          <h2 className="text-[1.15rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          <p className="mt-1 text-[0.82rem] text-ink-soft">{sub}</p>
          {children}
        </div>
      </div>
    </main>
  );
}

export function DoorField(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const { label, hint, ...rest } = props;
  return (
    <label className="block">
      <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">{label}</span>
      <input {...rest} className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-[0.86rem] text-ink outline-none focus-visible:border-accent" />
      {hint ? <span className="mt-1 block text-[0.72rem] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function DoorError({ error }: { error?: string }) {
  return error ? <p role="alert" className="rounded-sm border border-bad/25 bg-bad-wash px-3 py-2 text-[0.8rem] text-bad">{error}</p> : null;
}

export function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} w-full py-2 text-[0.86rem]`}>
      {pending ? busy : idle}
    </button>
  );
}
