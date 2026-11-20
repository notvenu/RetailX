"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type FormState } from "@/app/actions";
import { Door, DoorError, DoorField, Submit } from "@/components/door";

const COVER = {
  heading: "Tell us about your business once. Get a workspace built around it.",
  points: [
    { k: "Step 1", v: "Create your owner account: this page." },
    { k: "Step 2", v: "Pick your industry and category; answer a few questions about how you work." },
    { k: "Step 3", v: "Review the modules, KPIs, forecasts and AI roles we suggest. Change anything." },
    { k: "Step 4", v: "Choose a look, invite your team, and start recording." },
  ],
};

export default function SignUpPage() {
  const [state, action] = useActionState<FormState | undefined, FormData>(signupAction, undefined);
  return (
    <Door
      title="Create your business account"
      sub={<>Already set up? <Link href="/signin" className="font-medium text-accent hover:underline">Sign in</Link>.</>}
      cover={COVER}
    >
      <form action={action} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <DoorField label="Your name" name="name" autoComplete="name" required autoFocus />
          <DoorField label="Business name" name="business" autoComplete="organization" required />
        </div>
        <fieldset className="space-y-3 rounded-sm border border-rule p-3">
          <legend className="px-1 text-[0.72rem] text-ink-faint">Sign in with any of these. Add at least one.</legend>
          <DoorField label="Email" name="email" type="email" autoComplete="email" />
          <div className="grid gap-4 sm:grid-cols-2">
            <DoorField label="Mobile" name="phone" type="tel" autoComplete="tel" inputMode="tel" />
            <DoorField label="Username" name="username" autoComplete="username" pattern="[A-Za-z0-9._\-]{3,30}" />
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <DoorField label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters" />
          <DoorField label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <DoorError error={state?.error} />
        <Submit idle="Create account and continue" busy="Creating your workspace…" />
      </form>
    </Door>
  );
}
