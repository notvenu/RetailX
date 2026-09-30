"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";
import Link from "next/link";
import { MOCK_USERS } from "@/lib/users";

const GROUPS = [
  { k: "Overview", v: "Position, variance, what needs attention" },
  { k: "Operations", v: "Finance · Sales · Inventory · Procurement · People" },
  { k: "Intelligence", v: "Analytics · Forecasting · Decision support" },
];

export default function LoginPage() {
  const [state, formAction] = useActionState<LoginState | undefined, FormData>(
    login,
    undefined,
  );
  const [email, setEmail] = useState("owner@retailx.test");
  const [password, setPassword] = useState("retailx");

  return (
    <main className="grid min-h-screen place-items-center bg-panel px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[6px] border border-rule bg-white shadow-overlay lg:grid-cols-[1.05fr_1fr]">
        {/* report cover */}
        <div className="hidden flex-col bg-panel p-10 lg:flex">
          <Link href="/" className="self-start text-[1.4rem] font-bold tracking-[-0.03em] text-ink">
            Retail<span className="text-accent">X</span>
          </Link>
          <h1 className="mt-6 text-[1.35rem] font-semibold leading-snug tracking-[-0.02em] text-ink">
            The SME management ledger that reads its own numbers.
          </h1>
          <p className="mt-3 max-w-sm text-[0.85rem] leading-relaxed text-ink-soft">
            One book for finance, sales, inventory, procurement and people —
            with analytics, forecasting and branch-opening decision support
            built on the same records.
          </p>
          <dl className="mt-auto space-y-3 border-t border-rule pt-5">
            {GROUPS.map((g) => (
              <div key={g.k} className="grid grid-cols-[7rem_1fr] gap-3 text-[0.78rem]">
                <dt className="font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  {g.k}
                </dt>
                <dd className="text-ink-soft">{g.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* sign in */}
        <div className="p-8 sm:p-10">
          <Link href="/" className="mb-6 inline-block text-[1.2rem] font-bold tracking-[-0.03em] text-ink lg:hidden">
            Retail<span className="text-accent">X</span>
          </Link>
          <h2 className="text-[1.1rem] font-semibold tracking-[-0.01em] text-ink">
            Sign in
          </h2>
          <p className="mt-1 text-[0.8rem] text-ink-soft">
            Use a demo role below, or enter credentials.
          </p>

          <form action={formAction} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                Email
              </span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[4px] border border-rule-strong bg-white px-3 py-2 text-[0.85rem] text-ink outline-none focus-visible:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                Password
              </span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[4px] border border-rule-strong bg-white px-3 py-2 text-[0.85rem] text-ink outline-none focus-visible:border-accent"
              />
            </label>

            {state?.error && (
              <p className="rounded-[4px] border border-bad/25 bg-bad-wash px-3 py-2 text-[0.78rem] text-bad">
                {state.error}
              </p>
            )}

            <SubmitButton />
          </form>

          <div className="mt-6 border-t border-rule pt-4">
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Demo roles — password{" "}
              <span className="font-mono font-normal lowercase tracking-normal text-ink-soft">
                retailx
              </span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MOCK_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setEmail(u.email);
                    setPassword(u.password);
                  }}
                  className={`rounded-[4px] border px-3 py-2 text-left text-[0.78rem] transition-colors ${
                    email === u.email
                      ? "border-accent bg-accent-wash text-accent"
                      : "border-rule-strong text-ink-soft hover:border-ink-faint hover:text-ink"
                  }`}
                >
                  <span className="block font-medium">{u.role}</span>
                  <span className="block text-[0.7rem] text-ink-faint">{u.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[4px] bg-accent px-4 py-2 text-[0.85rem] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
