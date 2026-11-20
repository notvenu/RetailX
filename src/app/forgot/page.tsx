"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestReset, type FormState } from "@/app/actions";
import { Door, DoorError, DoorField, Submit } from "@/components/door";

const COVER = {
  heading: "Locked out? Get back in with the email or phone on your login.",
  points: [
    { k: "Email", v: "We send a reset link that works for 30 minutes." },
    { k: "Mobile", v: "We send the link on WhatsApp." },
    { k: "Username only", v: "Your business owner can set a new password from Settings → Team." },
  ],
};

export default function ForgotPage() {
  const [state, action] = useActionState<FormState | undefined, FormData>(requestReset, undefined);
  return (
    <Door title="Reset your password" sub={<>Remembered it? <Link href="/signin" className="font-medium text-accent hover:underline">Sign in</Link>.</>} cover={COVER}>
      {state?.ok ? (
        <p role="status" className="mt-6 rounded-sm border border-good/25 bg-good-wash px-3 py-2 text-[0.82rem] text-good">{state.ok}</p>
      ) : (
        <form action={action} className="mt-6 space-y-4">
          <DoorField label="Email, phone or username" name="identifier" autoComplete="username" required autoFocus />
          <DoorError error={state?.error} />
          <Submit idle="Send reset link" busy="Sending…" />
        </form>
      )}
    </Door>
  );
}
