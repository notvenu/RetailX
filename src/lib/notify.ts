/**
 * Outgoing messages. Email goes through Resend when RESEND_API_KEY is set; WhatsApp through the Meta Cloud API when
 * WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set. Without them, email lands in the outbox (and the server log) and
 * WhatsApp becomes a one-tap wa.me link for a person to send. Everything is recorded in the outbox either way.
 */
import { logOutbox } from "@/lib/db";
import { intlPhone, waLink } from "@/lib/links";

export { upiLink, waLink } from "@/lib/links";

export const emailConfigured = () => !!process.env.RESEND_API_KEY;
export const whatsappConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

export async function sendEmail(m: { to: string; subject: string; text: string; businessId?: string }): Promise<boolean> {
  let sent = false;
  if (emailConfigured()) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "RetailX <onboarding@resend.dev>", to: [m.to], subject: m.subject, text: m.text }),
    }).catch(() => null);
    sent = !!res?.ok;
  } else {
    console.log(`[email → ${m.to}] ${m.subject}\n${m.text}`);
  }
  await logOutbox({ businessId: m.businessId, channel: "email", recipient: m.to, subject: m.subject, body: m.text, sent });
  return sent;
}

/** Sends via the WhatsApp Cloud API when configured; returns null if sent, else a wa.me link for a person to tap. */
export async function sendWhatsApp(m: { to: string; text: string; businessId?: string }): Promise<string | null> {
  let sent = false;
  if (whatsappConfigured()) {
    // ponytail: free-form text only reaches customers who messaged you in the last 24h; business-initiated
    // messages need an approved template. Wire templates here when the account has them.
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: intlPhone(m.to), type: "text", text: { body: m.text } }),
    }).catch(() => null);
    sent = !!res?.ok;
  }
  await logOutbox({ businessId: m.businessId, channel: "whatsapp", recipient: m.to, body: m.text, sent });
  return sent ? null : waLink(m.to, m.text);
}

/* ---------------- browser push ---------------- */

let vapid: Promise<{ publicKey: string; privateKey: string }> | null = null;

/** VAPID keys from the environment, or generated once and kept in the database: push works with no setup. */
export function vapidKeys() {
  vapid ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    const { getKv, initKv } = await import("@/lib/db");
    const saved = await getKv("vapid");
    if (saved) return JSON.parse(saved);
    const webpush = (await import("web-push")).default;
    return JSON.parse(await initKv("vapid", JSON.stringify(webpush.generateVAPIDKeys())));
  })();
  return vapid;
}

async function push(userIds: string[], payload: { title: string; body: string; url: string }) {
  const { pushSubsFor, removePushSub } = await import("@/lib/db");
  const subs = await pushSubsFor(userIds);
  if (!subs.length) return;
  const webpush = (await import("web-push")).default;
  const keys = await vapidKeys();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@retailx.local", keys.publicKey, keys.privateKey);
  await Promise.all(subs.map((s) => webpush.sendNotification(s.sub, JSON.stringify(payload)).catch(async (e: { statusCode?: number }) => {
    if (e.statusCode === 404 || e.statusCode === 410) await removePushSub(s.endpoint); // the browser dropped it
  })));
}

/**
 * Tells the people in a business who match `who`: a push to every device they turned notifications on for, and an
 * email if they opted in to email.
 */
export async function notifyUsers(businessId: string, who: (u: { id: string; roleId: string }) => boolean, subject: string, text: string, url = "/tasks") {
  const { listUsers } = await import("@/lib/db");
  const people = (await listUsers(businessId)).filter(who);
  await push(people.map((u) => u.id), { title: subject, body: text.split("\n").find(Boolean) ?? text, url }).catch(() => {});
  for (const u of people)
    if (u.email && u.prefs?.emailNotify) await sendEmail({ to: u.email, subject, text: `Hi ${u.name},\n\n${text}\n\n— RetailX`, businessId });
}
