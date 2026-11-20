"use client";

import { useEffect, useState, useTransition } from "react";
import { BadgeCheck, CircleAlert } from "lucide-react";
import { changeOwnPassword, pushSubscribe, pushUnsubscribe, savePrefs, sendVerification, verifyPhone } from "@/app/actions";
import { Label, Section, Toggle, btnGhost, btnPrimary, control } from "@/components/ui";
import { ok } from "@/lib/result";

type U = { name: string; email?: string; phone?: string; username?: string; emailVerified: boolean; phoneVerified: boolean; emailNotify: boolean };

export function ProfilePanel({ user, channels, pushKey }: { user: U; channels: { email: boolean; whatsapp: boolean }; pushKey: string }) {
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [code, setCode] = useState("");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [notify, setNotify] = useState(user.emailNotify);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, done: string) => start(async () => { try { ok(await fn()); setMsg({ ok: done }); } catch (e) { setMsg({ err: (e as Error).message }); } });
  const Badge = ({ on }: { on: boolean }) => on
    ? <span className="inline-flex items-center gap-1 text-[0.74rem] text-good"><BadgeCheck className="size-3.5" /> Verified</span>
    : <span className="inline-flex items-center gap-1 text-[0.74rem] text-warn"><CircleAlert className="size-3.5" /> Not verified</span>;

  return (
    <div className="max-w-2xl">
      {msg.ok ? <p role="status" className="mt-5 rounded-sm border border-good/25 bg-good-wash px-3 py-2 text-[0.8rem] text-good">{msg.ok}</p> : null}
      {msg.err ? <p role="alert" className="mt-5 rounded-sm border border-bad/25 bg-bad-wash px-3 py-2 text-[0.8rem] text-bad">{msg.err}</p> : null}

      <Section title="Your logins">
        <dl className="divide-y divide-rule text-[0.85rem]">
          {user.email ? (
            <div className="flex flex-wrap items-center gap-3 py-2.5">
              <dt className="w-24 text-ink-faint">Email</dt><dd className="flex-1 text-ink">{user.email}</dd><Badge on={user.emailVerified} />
              {!user.emailVerified ? <button className={btnGhost} disabled={pending} onClick={() => run(() => sendVerification("email"), channels.email ? "Check your inbox for the confirmation link." : "Email isn't set up on this server yet, so the link was written to the server log.")}>Send link</button> : null}
            </div>
          ) : null}
          {user.phone ? (
            <div className="flex flex-wrap items-center gap-3 py-2.5">
              <dt className="w-24 text-ink-faint">Mobile</dt><dd className="flex-1 text-ink">{user.phone}</dd><Badge on={user.phoneVerified} />
              {!user.phoneVerified ? (
                <>
                  <button className={btnGhost} disabled={pending} onClick={() => run(() => sendVerification("phone"), channels.whatsapp ? "We sent a 6-digit code on WhatsApp." : "WhatsApp isn't set up on this server yet, so the code is in the server's message outbox.")}>Send code</button>
                  <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); run(() => verifyPhone(code), "Mobile number verified."); }}>
                    <input aria-label="Verification code" inputMode="numeric" maxLength={6} className={`${control} w-24 text-center tracking-[0.2em]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
                    <button className={btnPrimary} disabled={pending || code.length !== 6}>Verify</button>
                  </form>
                </>
              ) : null}
            </div>
          ) : null}
          {user.username ? <div className="flex gap-3 py-2.5"><dt className="w-24 text-ink-faint">Username</dt><dd className="text-ink">@{user.username}</dd></div> : null}
        </dl>
        <p className="mt-2 text-[0.75rem] text-ink-faint">Any of these signs you in. To change them, ask your business owner (Settings → Team).</p>
      </Section>

      <Section title="Password">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); run(async () => { ok(await changeOwnPassword(pw.current, pw.next)); setPw({ current: "", next: "" }); }, "Password changed."); }}>
          <Label text="Current password"><input type="password" autoComplete="current-password" className={control} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Label>
          <Label text="New password"><input type="password" autoComplete="new-password" minLength={8} className={control} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Label>
          <button className={btnPrimary} disabled={pending}>Change</button>
        </form>
      </Section>

      <Section title="Notifications">
        <label className="flex items-center gap-3 text-[0.85rem] text-ink-soft">
          <Toggle on={notify} label="Email me" onChange={(v) => { setNotify(v); run(() => savePrefs({ emailNotify: v }), v ? "We'll email you tasks assigned to you and approvals waiting." : "Email notifications off."); }} />
          Email me when a task is assigned to me or something waits for my approval{user.email ? "" : " (add an email to your login first)"}
        </label>
        <PushToggle publicKey={pushKey} onResult={setMsg} />
      </Section>
    </div>
  );
}

/** base64url VAPID key → the bytes PushManager wants */
const keyBytes = (k: string) => Uint8Array.from(atob(k.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(k.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

/** Browser notifications for this device: tasks assigned to you, approvals waiting. Needs HTTPS or localhost. */
function PushToggle({ publicKey, onResult }: { publicKey: string; onResult: (m: { ok?: string; err?: string }) => void }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "blocked">("off");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.getRegistration("/").then((r) => r?.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off")).catch(() => {});
  }, []);
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (on) {
        if ((await Notification.requestPermission()) !== "granted") { setState("blocked"); throw new Error("Notifications are blocked for this site in your browser settings."); }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        ok(await pushSubscribe(JSON.parse(JSON.stringify(sub))));
        setState("on");
        onResult({ ok: "This device will get a notification when a task is assigned to you or something needs your approval." });
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) { ok(await pushUnsubscribe(sub.endpoint)); await sub.unsubscribe(); }
        setState("off");
        onResult({ ok: "Notifications off on this device." });
      }
    } catch (e) {
      onResult({ err: (e as Error).message });
    }
    setBusy(false);
  };
  return (
    <label className="mt-3 flex items-center gap-3 text-[0.85rem] text-ink-soft">
      {state === "unsupported" ? <span className="text-ink-faint">This browser can&apos;t show push notifications.</span> : (
        <>
          <Toggle on={state === "on"} label="Notifications on this device" onChange={(v) => { if (!busy) void toggle(v); }} />
          Notifications on this device{state === "blocked" ? " (blocked in your browser settings)" : ""}
        </>
      )}
    </label>
  );
}
