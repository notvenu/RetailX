"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resetPassword, type FormState } from "@/app/actions";
import { Door, DoorError, DoorField, Submit } from "@/components/door";

const COVER = { heading: "Choose a new password.", points: [{ k: "Tip", v: "Use 8 or more characters; a short sentence is easy to remember and hard to guess." }] };

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [state, action] = useActionState<FormState | undefined, FormData>(resetPassword, undefined);
  if (state?.ok) return <p role="status" className="mt-6 rounded-sm border border-good/25 bg-good-wash px-3 py-2 text-[0.82rem] text-good">{state.ok} <Link href="/signin" className="font-medium underline">Sign in</Link></p>;
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      <DoorField label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
      <DoorField label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      <DoorError error={!token ? "This page needs the link from your reset message." : state?.error} />
      <Submit idle="Set new password" busy="Saving…" />
    </form>
  );
}

export default function ResetPage() {
  return (
    <Door title="Set a new password" sub={<>Need a new link? <Link href="/forgot" className="font-medium text-accent hover:underline">Ask again</Link>.</>} cover={COVER}>
      <Suspense><ResetForm /></Suspense>
    </Door>
  );
}
