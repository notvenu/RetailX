"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signinAction, type FormState } from "@/app/actions";
import { Door, DoorError, DoorField, Submit } from "@/components/door";

const COVER = {
  heading: "Welcome back. Your business, your team and your AI leadership are where you left them.",
  points: [
    { k: "One login", v: "Your email, phone or username already knows your business and your role." },
    { k: "Your role", v: "You see exactly the modules your owner gave your role, nothing to choose." },
    { k: "Your AI team", v: "Briefings and tasks from your CFO, COO, GM and others are waiting." },
  ],
};

function SignInForm() {
  const from = useSearchParams().get("from") ?? "";
  const [state, action] = useActionState<FormState | undefined, FormData>(signinAction, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="from" value={from} />
      <DoorField label="Email, phone or username" name="identifier" autoComplete="username" required autoFocus />
      <DoorField label="Password" name="password" type="password" autoComplete="current-password" required />
      <p className="-mt-2 text-right text-[0.76rem]"><Link href="/forgot" className="text-accent hover:underline">Forgot password?</Link></p>
      <DoorError error={state?.error} />
      <Submit idle="Sign in" busy="Signing in…" />
    </form>
  );
}

export default function SignInPage() {
  return (
    <Door
      title="Sign in"
      sub={<>New here? <Link href="/signup" className="font-medium text-accent hover:underline">Set up your business</Link> in a few minutes.</>}
      cover={COVER}
    >
      <Suspense>
        <SignInForm />
      </Suspense>
    </Door>
  );
}
