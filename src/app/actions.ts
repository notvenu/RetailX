"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import {
  addUser, adjustNumbers, allow, audit, authenticate, getUser, clearAttempts, createAccount, createToken, findUser, getKv, getRecord, initKv, insertRecords, listAudit, listDeleted, listUsers,
  markVerified, removePushSub, removeSampleRecords, removeUser, savePushSub, saveUserPrefs, setDeleted, setPassword, updateBusiness, updateRecordData, updateUser, consumeToken,
  type NewUser,
} from "@/lib/db";
import { DEFAULT_PROFILE, applyFeatures, ensureCounter, recommend } from "@/lib/catalog";
import { MODES, billNo, billPrefix, cashierCheck, dayTotals, discountWithPoints, isExpired, overLimit, pointsBalance, priceBill, r2, returnable, type BillKind, type CartLine, type Mode } from "@/lib/pos";
import { applyOffers, expiryAdvice } from "@/lib/offers";
import { customerOf, dueDate, isTallyXml, parseTallyMasters, tcsOn } from "@/lib/extras";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { todayIso } from "@/lib/metrics";
import { researchBenchmarks, workTask } from "@/lib/ai";
import { validRange } from "@/lib/benchmarks";
import { addTask, deliver, log, onRecord, runNow, type Outgoing } from "@/lib/automation";
import { notifyUsers, sendEmail, sendWhatsApp } from "@/lib/notify";
import { sampleRecords } from "@/lib/sample";
import { payRun } from "@/lib/payroll";
import { runAutoOrder } from "@/lib/autorun";
import { actionCtx } from "@/lib/session";
import type { Failure } from "@/lib/result";
import {
  uid, type Automation, type BusinessConfig, type RecordRow, type SavedView, type Task, type UserPrefs, type Value, type Widget,
} from "@/lib/model";

export type FormState = { error?: string; ok?: string };

/**
 * Runs an action and returns its error as a Failure (see src/lib/result.ts) instead of throwing it. Messages we wrote
 * (plain `Error`) reach the person; anything else (database, bugs) is logged and shown as a generic message.
 */
async function attempt<T>(fn: () => Promise<T>): Promise<T | Failure> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Error && e.constructor === Error) return { __error: e.message };
    console.error(e);
    return { __error: "Something went wrong on our side. Try again in a moment." };
  }
}

const done = () => revalidatePath("/", "layout");
const ip = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
/**
 * Base URL for links we send (password reset, verification). Never taken from request headers in production: a
 * forged Host header would otherwise mail a victim a valid reset token on the attacker's domain.
 */
const appUrl = async () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NODE_ENV === "production") throw new Error("Set APP_URL so emailed links point at your site.");
  return `http://${(await headers()).get("host") ?? "localhost:3000"}`; // development only
};
/** Same-site path only: "/x" yes; "//evil.com" and "/\\evil.com" (both off-site in browsers) no. */
const safePath = (p: string) => (/^\/(?![/\\])/.test(p) ? p : "/dashboard");

/* ================= doors ================= */

export async function signinAction(_: FormState | undefined, fd: FormData): Promise<FormState> {
  const from = String(fd.get("from") ?? "");
  const id = String(fd.get("identifier") ?? "").trim().toLowerCase();
  // 8 tries per login per 15 minutes, 30 per network address: enough for typos, too few for guessing
  if (!(await allow(`signin:${id}`, 8, 15 * 60e3)) || !(await allow(`signin-ip:${await ip()}`, 30, 15 * 60e3)))
    return { error: "Too many attempts. Wait 15 minutes, or reset your password." };
  try {
    await signIn("credentials", {
      identifier: id,
      password: fd.get("password"),
      redirectTo: safePath(from),
    });
    return {};
  } catch (e) {
    if (e instanceof AuthError) return { error: "That sign-in and password don't match an account." };
    await clearAttempts(`signin:${id}`); // NEXT_REDIRECT: signed in
    throw e;
  }
}

export async function signupAction(_: FormState | undefined, fd: FormData): Promise<FormState> {
  if (!(await allow(`signup-ip:${await ip()}`, 5, 3600e3))) return { error: "Too many sign-ups from this network. Try again in an hour." };
  const v = (k: string) => String(fd.get(k) ?? "").trim();
  const owner = { name: v("name"), email: v("email") || undefined, phone: v("phone") || undefined, username: v("username") || undefined, password: String(fd.get("password") ?? "") };
  if (!owner.name || !v("business")) return { error: "Tell us your name and your business's name." };
  if (!owner.email && !owner.phone && !owner.username) return { error: "Add at least one way to sign in: email, phone or username." };
  if (owner.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email)) return { error: "That email doesn't look right." };
  if (owner.phone && owner.phone.replace(/\D/g, "").length < 10) return { error: "That mobile number looks too short." };
  if (owner.username && !/^[a-z0-9._-]{3,30}$/i.test(owner.username)) return { error: "Usernames are 3–30 letters, numbers, dots, dashes or underscores." };
  if (owner.password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (owner.password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  let userId = "";
  try {
    const base = recommend({ industry: "other", category: "General", city: "", country: "India", currency: "INR", fiscalStart: 4, profile: DEFAULT_PROFILE });
    const u = await createAccount(owner, v("business"), { ...base, name: v("business") });
    userId = u.id;
    await audit(u.businessId, { actor: u.name, action: "create", entity: "business", entityId: u.businessId, summary: `Created ${v("business")}` });
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (owner.email) await sendVerificationTo(userId, "email").catch(() => {});
  try {
    await signIn("credentials", { identifier: owner.email ?? owner.phone ?? owner.username, password: owner.password, redirectTo: "/onboarding" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Account created, but signing in failed. Try signing in." };
    throw e;
  }
  return {};
}

export async function signoutAction() {
  await signOut({ redirectTo: "/signin" });
}

/** Always answers the same way, so it can't be used to find out who has an account. */
export async function requestReset(_: FormState | undefined, fd: FormData): Promise<FormState> {
  const id = String(fd.get("identifier") ?? "").trim();
  const ok = { ok: "If that login exists, we've sent reset instructions to its email or WhatsApp." };
  if (!id || !(await allow(`reset:${id.toLowerCase()}`, 3, 3600e3))) return ok;
  const u = await findUser(id);
  if (!u) return ok;
  const base = await appUrl().catch((e) => { console.error(e.message); return null; });
  if (!base) return ok;
  const { token } = await createToken(u.id, "reset", 30);
  const link = `${base}/reset?token=${token}`;
  if (u.email) await sendEmail({ to: u.email, subject: "Reset your RetailX password", text: `Hi ${u.name},\n\nReset your password within 30 minutes:\n${link}\n\nIf you didn't ask for this, ignore this email.`, businessId: u.businessId });
  else if (u.phone) await sendWhatsApp({ to: u.phone, text: `RetailX password reset link (valid 30 min): ${link}`, businessId: u.businessId });
  else return { ok: "This login has no email or phone. Ask your business owner to reset your password from Settings → Team." };
  return ok;
}

export async function resetPassword(_: FormState | undefined, fd: FormData): Promise<FormState> {
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return { error: "Use a password of at least 8 characters." };
  if (pw !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const userId = await consumeToken("reset", { token: String(fd.get("token") ?? "") });
  if (!userId) return { error: "This reset link has expired or was already used. Ask for a new one." };
  await setPassword(userId, pw);
  return { ok: "Password changed. You can sign in now." };
}

export async function confirmEmail(token: string): Promise<boolean> {
  const userId = await consumeToken("verify-email", { token });
  if (userId) await markVerified(userId, "email");
  return !!userId;
}

async function sendVerificationTo(userId: string, kind: "email" | "phone") {
  const u = (await getUser(userId))!;
  const { token, code } = await createToken(userId, kind === "email" ? "verify-email" : "verify-phone", 60 * 24);
  if (kind === "email" && u.email)
    await sendEmail({ to: u.email, subject: "Confirm your email for RetailX", text: `Confirm this email address:\n${await appUrl()}/verify?token=${token}`, businessId: u.businessId });
  if (kind === "phone" && u.phone)
    await sendWhatsApp({ to: u.phone, text: `Your RetailX verification code is ${code}. It expires in 24 hours.`, businessId: u.businessId });
}

export async function sendVerification(kind: "email" | "phone") {
  return attempt(async () => {
    const ctx = await actionCtx();
    if (!(await allow(`verify:${ctx.user.id}:${kind}`, 5, 3600e3))) throw new Error("Too many codes requested. Try again in an hour.");
    await sendVerificationTo(ctx.user.id, kind);
  });
}

export async function verifyPhone(code: string) {
  return attempt(async () => {
    const ctx = await actionCtx();
    if (!(await allow(`verify-code:${ctx.user.id}`, 10, 3600e3))) throw new Error("Too many tries. Ask for a new code later.");
    const id = await consumeToken("verify-phone", { userId: ctx.user.id, code: code.trim() });
    if (!id) throw new Error("That code is wrong or has expired.");
    await markVerified(id, "phone");
    done();
  });
}

export async function changeOwnPassword(current: string, next: string) {
  return attempt(async () => {
    const ctx = await actionCtx();
    const login = ctx.user.email ?? ctx.user.phone ?? ctx.user.username!;
    if (!(await authenticate(login, current))) throw new Error("Your current password is wrong.");
    if (next.length < 8) throw new Error("Use a password of at least 8 characters.");
    await setPassword(ctx.user.id, next);
    await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "user", entityId: ctx.user.id, summary: "Changed their password" });
  });
}

/* ================= onboarding & settings ================= */

const CONFIG_KEYS: (keyof BusinessConfig)[] = [
  "name", "industry", "category", "city", "country", "currency", "locale", "fiscalStart", "profile",
  "modules", "kpis", "forecasts", "analytics", "aiRoles", "automations", "dashboard", "theme", "roles",
  "gstin", "state", "upiId", "cash", "events", "language", "counter",
];

function applyConfig(target: BusinessConfig, patch: Partial<BusinessConfig>) {
  const changed: string[] = [];
  const pinHash = target.counter?.pinHash; // set only by setOwnerPin, never by a settings save
  for (const k of CONFIG_KEYS) {
    if (patch[k] === undefined) continue;
    if (JSON.stringify(target[k]) !== JSON.stringify(patch[k])) changed.push(k);
    (target as Record<string, unknown>)[k] = patch[k];
  }
  if (target.counter) {
    const c = target.counter, pct = (v: unknown, max: number) => (Number(v) > 0 ? Math.min(Number(v), max) : undefined);
    const prefix = String(c.prefix ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
    target.counter = {
      prefix: prefix || undefined, blockNegative: !!c.blockNegative, receipt: c.receipt === "58mm" ? "58mm" : "80mm",
      tcsRate: pct(c.tcsRate, 5), incentivePct: pct(c.incentivePct, 50), referralPct: pct(c.referralPct, 50),
      layout: c.layout === "modern" || c.layout === "compact" ? c.layout : "classic",
      terms: String(c.terms ?? "").slice(0, 600) || undefined, bank: String(c.bank ?? "").slice(0, 300) || undefined, pinHash,
    };
  }
  if (patch.features) {
    target.features = { certificates: !!patch.features.certificates, nutrition: !!patch.features.nutrition };
    applyFeatures(target);
  }
  // the owner role always keeps full access, so nobody can lock the business out of itself
  const owner = target.roles.find((r) => r.id === "owner");
  if (owner) owner.access = ["*"];
  else target.roles.unshift({ id: "owner", name: "Owner", access: ["*"] });
  return changed;
}

export type Invite = Omit<NewUser, "password"> & { password: string };

export async function completeOnboarding(config: BusinessConfig, invites: Invite[], withSample = false): Promise<{ error?: string }> {
  const ctx = await actionCtx();
  if (ctx.user.roleId !== "owner") return { error: "Only the owner can set up the workspace." };
  const errors: string[] = [];
  await updateBusiness(ctx.business.id, (b) => {
    applyConfig(b, config);
    b.onboarded = true;
    log(b, `${ctx.user.name} set up ${b.name}: ${b.modules.filter((m) => m.enabled).length} modules, ${b.kpis.length} KPIs, ${b.aiRoles.filter((r) => r.enabled).length} AI roles`);
    for (const r of b.aiRoles.filter((x) => x.enabled))
      addTask(b, { title: `Introduce yourself and share your first ${r.title} briefing`, assignee: `ai:${r.id}`, source: "onboarding" });
  });
  if (withSample) for (const [mod, rows] of Object.entries(sampleRecords(config.modules))) await insertRecords(ctx.business.id, mod, rows);
  for (const inv of invites) {
    if (inv.roleId === "owner" || !config.roles.some((r) => r.id === inv.roleId)) { errors.push(`${inv.name}: pick a role other than Owner.`); continue; }
    if (String(inv.password ?? "").length < 8) { errors.push(`${inv.name}: temporary passwords need 8+ characters.`); continue; }
    try { await addUser(ctx.business.id, inv); } catch (e) { errors.push((e as Error).message); }
  }
  await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "business", summary: `Completed onboarding${withSample ? " with sample data" : ""}` });
  done();
  if (errors.length) return { error: `Workspace ready, but some invites failed: ${errors.join(" ")}` };
  redirect("/dashboard");
}

export async function saveConfig(patch: Partial<BusinessConfig>) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    const changed = await updateBusiness(ctx.business.id, (b) => applyConfig(b, patch));
    if (changed.length) await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "settings", summary: `Changed ${changed.join(", ")}` });
    done();
  });
}

const clampWidgets = (widgets: Widget[]) => widgets.slice(0, 40).map((w) => ({ ...w, w: Math.min(4, Math.max(1, w.w)), h: Math.min(3, Math.max(1, w.h)) }));

/** The business-wide layout everyone starts from. */
export async function saveDashboard(widgets: Widget[]) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    await updateBusiness(ctx.business.id, (b) => { b.dashboard = clampWidgets(widgets); });
    await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "dashboard", summary: "Changed the business dashboard layout" });
    done();
  });
}

/** A layout for just this person; `null` goes back to the business layout. */
export async function savePersonalDashboard(widgets: Widget[] | null) {
  return attempt(async () => {
    const ctx = await actionCtx("dashboard");
    await saveUserPrefs(ctx.user.id, { dashboard: widgets ? clampWidgets(widgets) : undefined });
    done();
  });
}

export async function pushSubscribe(sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } }) {
  return attempt(async () => {
    const ctx = await actionCtx();
    if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("That browser subscription looks wrong.");
    await savePushSub(ctx.user.id, sub);
  });
}

export async function pushUnsubscribe(endpoint: string) {
  return attempt(async () => {
    const ctx = await actionCtx();
    await removePushSub(endpoint, ctx.user.id);
  });
}

export async function savePrefs(patch: Pick<UserPrefs, "lang" | "emailNotify" | "seenAt">) {
  return attempt(async () => {
    const ctx = await actionCtx();
    await saveUserPrefs(ctx.user.id, patch);
    done();
  });
}

export async function saveView(moduleId: string, view: SavedView) {
  return attempt(async () => {
    const ctx = await actionCtx(moduleId);
    const views = { ...ctx.user.prefs?.views };
    views[moduleId] = [...(views[moduleId] ?? []).filter((v) => v.id !== view.id), { ...view, name: view.name.slice(0, 40) }].slice(-20);
    await saveUserPrefs(ctx.user.id, { views });
    done();
  });
}

export async function deleteView(moduleId: string, id: string) {
  return attempt(async () => {
    const ctx = await actionCtx(moduleId);
    const views = { ...ctx.user.prefs?.views, [moduleId]: (ctx.user.prefs?.views?.[moduleId] ?? []).filter((v) => v.id !== id) };
    await saveUserPrefs(ctx.user.id, { views });
    done();
  });
}

/* ================= team ================= */

export async function addMember(n: Invite) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    if (!ctx.business.roles.some((r) => r.id === n.roleId) || n.roleId === "owner") throw new Error("Pick a role.");
    if (n.password.length < 8) throw new Error("Temporary passwords need at least 8 characters.");
    const u = await addUser(ctx.business.id, n);
    await audit(ctx.business.id, { actor: ctx.user.name, action: "create", entity: "user", entityId: u.id, summary: `Added ${u.name} as ${n.roleId}` });
    done();
  });
}

/** Only the owner may touch the owner's account: otherwise a manager could reset its password and take over. */
async function guardOwner(ctx: Awaited<ReturnType<typeof actionCtx>>, id: string) {
  const target = (await listUsers(ctx.business.id)).find((u) => u.id === id);
  if (!target) throw new Error("No such member.");
  if (target.roleId === "owner" && ctx.user.id !== id) throw new Error("Only the owner can change the owner's account.");
  return target;
}

export async function updateMember(id: string, patch: Partial<Invite>) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    const target = await guardOwner(ctx, id);
    if (patch.roleId && target.roleId === "owner") throw new Error("The owner's role can't change.");
    if (patch.roleId && !ctx.business.roles.some((r) => r.id === patch.roleId)) throw new Error("Pick a role.");
    if (id === ctx.user.id && patch.roleId && patch.roleId !== ctx.user.roleId) throw new Error("You can't change your own role.");
    if (patch.roleId === "owner") throw new Error("There is one owner per business.");
    if (patch.password !== undefined && patch.password !== "" && patch.password.length < 8) throw new Error("Passwords need at least 8 characters.");
    await updateUser(ctx.business.id, id, { ...patch, password: patch.password || undefined });
    await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "user", entityId: id,
      summary: patch.password ? "Reset a member's password" : `Changed member: ${Object.keys(patch).join(", ")}` });
    done();
  });
}

export async function removeMember(id: string) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    if (id === ctx.user.id) throw new Error("You can't remove yourself.");
    await guardOwner(ctx, id);
    await removeUser(ctx.business.id, id);
    await audit(ctx.business.id, { actor: ctx.user.name, action: "delete", entity: "user", entityId: id, summary: "Removed a member" });
    done();
  });
}

/* ================= records ================= */

function clean(ctxBusiness: BusinessConfig, moduleId: string, raw: Record<string, string>) {
  const mod = ctxBusiness.modules.find((m) => m.id === moduleId && m.enabled);
  if (!mod) throw new Error("This module is switched off.");
  const data: Record<string, Value> = {};
  for (const f of mod.fields) {
    const v = String(raw[f.key] ?? "").trim();
    if (f.required && !v) throw new Error(`${f.label} is required.`);
    if (!v) continue;
    if (f.type === "number" || f.type === "money") {
      const n = Number(v.replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(n)) throw new Error(`${f.label} must be a number.`);
      data[f.key] = n;
    } else if (f.type === "date") {
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(v);
      // dd/mm/yyyy and dd-mm-yyyy, as Indian spreadsheets (Tally, Vyapar, bank statements) write them
      const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
      const d = iso ? new Date(v + "T00:00:00Z") : dmy ? new Date(Date.UTC(+(dmy[3].length === 2 ? "20" + dmy[3] : dmy[3]), +dmy[2] - 1, +dmy[1])) : new Date(v);
      if (isNaN(+d)) throw new Error(`${f.label} must be a date (YYYY-MM-DD or DD/MM/YYYY).`);
      data[f.key] = iso ? v : dmy ? d.toISOString().slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } else if (f.type === "boolean") {
      // a ticked box, or Yes / Y / true / 1 from a spreadsheet; anything else is a no, which is not stored
      if (/^(true|yes|y|1|on)$/i.test(v)) data[f.key] = true;
    } else data[f.key] = v.slice(0, 2000);
  }
  return data;
}

export async function saveRecord(moduleId: string, raw: Record<string, string>, id?: string) {
  return attempt(async () => {
    const ctx = await actionCtx(moduleId);
    const data = clean(ctx.business, moduleId, raw);
    const before = id ? await getRecord(ctx.business.id, id) : null;
    if (id && (!before || before.module !== moduleId)) throw new Error("That record no longer exists.");
    const row: RecordRow = before ? { ...before.row, data } : { id: uid("r_"), at: new Date().toISOString(), by: ctx.user.name, data };
    const out: Outgoing[] = [];
    await updateBusiness(ctx.business.id, (b) => onRecord(b, moduleId, row, out)); // may set fields on `row`
    if (before) await updateRecordData(ctx.business.id, row.id, row.data);
    else await insertRecords(ctx.business.id, moduleId, [row]);
    await audit(ctx.business.id, {
      actor: ctx.user.name, action: before ? "update" : "create", entity: moduleId, entityId: row.id,
      summary: `${before ? "Edited" : "Added"} a ${ctx.business.modules.find((m) => m.id === moduleId)?.name ?? moduleId} record`,
      before: before?.row.data, after: row.data,
    });
    await deliver(ctx.business.id, out);
    done();
    return row;
  });
}

/** Moves a record to the recycle bin (kept 30 days); `restoreRecord` brings it back. */
export async function deleteRecord(moduleId: string, id: string) {
  return attempt(async () => {
    const ctx = await actionCtx(moduleId);
    const r = await getRecord(ctx.business.id, id);
    if (!r || r.module !== moduleId) return;
    await setDeleted(ctx.business.id, id, true);
    await audit(ctx.business.id, { actor: ctx.user.name, action: "delete", entity: moduleId, entityId: id, summary: "Moved a record to the recycle bin", before: r.row.data });
    done();
  });
}

export async function restoreRecord(moduleId: string, id: string) {
  return attempt(async () => {
    const ctx = await actionCtx(moduleId);
    const r = await getRecord(ctx.business.id, id);
    if (!r || r.module !== moduleId) return;
    await setDeleted(ctx.business.id, id, false);
    await audit(ctx.business.id, { actor: ctx.user.name, action: "restore", entity: moduleId, entityId: id, summary: "Restored a record from the recycle bin" });
    done();
  });
}

export async function deletedRecords(moduleId: string) {
  const ctx = await actionCtx(moduleId, { read: true });
  return listDeleted(ctx.business.id, moduleId);
}

export async function recordHistory(moduleId: string, id: string) {
  const ctx = await actionCtx(moduleId, { read: true });
  return listAudit(ctx.business.id, { entityId: id, limit: 50 });
}

/** Bulk import (CSV/paste). Automations don't fire on imports, so history doesn't flood the task list. */
export async function importRecords(moduleId: string, rows: Record<string, string>[]) {
  return attempt(async () => {
    const ctx = await actionCtx(moduleId);
    const skipped: string[] = [];
    const good: RecordRow[] = [];
    rows.slice(0, 20000).forEach((raw, i) => {
      try { good.push({ id: uid("r_"), at: new Date().toISOString(), by: ctx.user.name, data: clean(ctx.business, moduleId, raw) }); }
      catch (e) { if (skipped.length < 20) skipped.push(`Row ${i + 2}: ${(e as Error).message}`); }
    });
    await insertRecords(ctx.business.id, moduleId, good);
    const name = ctx.business.modules.find((m) => m.id === moduleId)?.name ?? moduleId;
    await updateBusiness(ctx.business.id, (b) => log(b, `${ctx.user.name} imported ${good.length} ${name} records`));
    await audit(ctx.business.id, { actor: ctx.user.name, action: "import", entity: moduleId, summary: `Imported ${good.length} ${name} records${skipped.length ? `, skipped ${rows.length - good.length}` : ""}` });
    done();
    return { added: good.length, skipped };
  });
}

export async function removeSampleData() {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    const n = await removeSampleRecords(ctx.business.id);
    await audit(ctx.business.id, { actor: ctx.user.name, action: "delete", entity: "records", summary: `Removed ${n} sample records` });
    done();
  });
}

/* ================= tasks & approvals ================= */

export async function saveTask(t: Partial<Task> & { title: string }) {
  return attempt(async () => {
    const ctx = await actionCtx("tasks");
    if (!t.title?.trim()) throw new Error("Give the task a title.");
    const newAssignee = await updateBusiness(ctx.business.id, (b) => {
      const cur = t.id ? b.tasks.find((x) => x.id === t.id) : undefined;
      const changed = t.assignee && t.assignee !== cur?.assignee ? t.assignee : null;
      if (cur) Object.assign(cur, { title: t.title, detail: t.detail, assignee: t.assignee, due: t.due, status: t.status ?? cur.status, result: t.result ?? cur.result });
      else addTask(b, { title: t.title.slice(0, 200), detail: t.detail, assignee: t.assignee, due: t.due, status: t.status, source: `user:${ctx.user.id}` });
      return changed;
    });
    if (newAssignee?.startsWith("user:") && newAssignee !== `user:${ctx.user.id}`)
      await notifyUsers(ctx.business.id, (u) => `user:${u.id}` === newAssignee, `New task: ${t.title}`, `${ctx.user.name} assigned you a task in ${ctx.business.name}:

  ${t.title}${t.due ? `
  Due ${t.due}` : ""}`);
    done();
  });
}

export async function deleteTask(id: string) {
  return attempt(async () => {
    const ctx = await actionCtx("tasks");
    await updateBusiness(ctx.business.id, (b) => { b.tasks = b.tasks.filter((x) => x.id !== id); });
    done();
  });
}

/** Approve or reject something an AI role drafted: a task (`t_…`) or an automation (`au_…`). */
export async function decide(id: string, approve: boolean) {
  return attempt(async () => {
    const ctx = await actionCtx(id.startsWith("au_") ? "automations" : "tasks");
    const what = await updateBusiness(ctx.business.id, (b) => {
      if (id.startsWith("au_")) {
        const a = b.automations.find((x) => x.id === id);
        if (!a) return null;
        if (approve) a.enabled = true; else b.automations = b.automations.filter((x) => x.id !== id);
        log(b, `${ctx.user.name} ${approve ? "approved" : "rejected"} automation “${a.name}”`);
        return a.name;
      }
      const t = b.tasks.find((x) => x.id === id);
      if (!t) return null;
      if (approve) delete t.needsApproval; else b.tasks = b.tasks.filter((x) => x.id !== id);
      log(b, `${ctx.user.name} ${approve ? "approved" : "rejected"} task “${t.title}”`);
      return t.title;
    });
    if (what) await audit(ctx.business.id, { actor: ctx.user.name, action: approve ? "approve" : "reject", entity: id.startsWith("au_") ? "automation" : "task", entityId: id, summary: `${approve ? "Approved" : "Rejected"} “${what}”` });
    done();
  });
}

/* ================= automations ================= */

export async function saveAutomation(a: Automation) {
  return attempt(async () => {
    const ctx = await actionCtx("automations");
    await updateBusiness(ctx.business.id, (b) => {
      const i = b.automations.findIndex((x) => x.id === a.id);
      if (i >= 0) b.automations[i] = { ...b.automations[i], ...a };
      else b.automations.push({ ...a, id: uid("au_"), runs: 0, createdBy: `user:${ctx.user.id}` });
    });
    await audit(ctx.business.id, { actor: ctx.user.name, action: a.id ? "update" : "create", entity: "automation", entityId: a.id || undefined, summary: `${a.id ? "Changed" : "Created"} automation “${a.name}”${a.enabled ? "" : " (off)"}` });
    done();
  });
}

export async function deleteAutomation(id: string) {
  return attempt(async () => {
    const ctx = await actionCtx("automations");
    await updateBusiness(ctx.business.id, (b) => { b.automations = b.automations.filter((x) => x.id !== id); });
    await audit(ctx.business.id, { actor: ctx.user.name, action: "delete", entity: "automation", entityId: id, summary: "Deleted an automation" });
    done();
  });
}

export async function runAutomation(id: string) {
  return attempt(async () => {
    const ctx = await actionCtx("automations");
    const out = await updateBusiness(ctx.business.id, (b) => runNow(b, id), { records: true });
    await deliver(ctx.business.id, out);
    done();
  });
}

/* ================= AI roles (chat streams through /api/ai) ================= */

export async function workOnTask(taskId: string) {
  return attempt(async () => {
    const ctx = await actionCtx("ai");
    await workTask(ctx.business.id, taskId);
    done();
  });
}

export async function clearThread(roleId: string) {
  return attempt(async () => {
    const ctx = await actionCtx("ai");
    await updateBusiness(ctx.business.id, (b) => { b.threads[roleId] = []; });
    done();
  });
}

export async function saveMemory(roleId: string, memory: string[]) {
  return attempt(async () => {
    const ctx = await actionCtx("ai");
    await updateBusiness(ctx.business.id, (b) => {
      const r = b.aiRoles.find((x) => x.id === roleId);
      if (r) r.memory = memory.map((m) => m.trim().slice(0, 300)).filter(Boolean).slice(0, 30);
    });
    done();
  });
}

/* ================= market benchmarks ================= */

/** The owner's own market figure for a KPI (e.g. from a trade association); `null` goes back to the default. */
export async function saveBenchmark(kpiId: string, range: { p25: number; p50: number; p75: number; source?: string } | null) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    if (range && !validRange(range)) throw new Error("Enter three numbers from low to high: 25th percentile ≤ typical ≤ 75th percentile.");
    await updateBusiness(ctx.business.id, (b) => {
      b.benchmarks ??= {};
      if (range) b.benchmarks[kpiId] = { p25: range.p25, p50: range.p50, p75: range.p75, origin: "owner", source: range.source?.slice(0, 200) || `Entered by ${ctx.user.name}`, asOf: new Date().toISOString().slice(0, 10) };
      else delete b.benchmarks[kpiId];
    });
    await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "benchmark", entityId: kpiId, summary: range ? `Set the market range for ${kpiId}` : `Reset the market range for ${kpiId}` });
    done();
  });
}

export async function refreshBenchmarks() {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    const r = await researchBenchmarks(ctx.business.id);
    await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "benchmark", summary: `Researched market figures: ${r.saved.length} found, ${r.skipped} not sourced` });
    done();
    return r;
  });
}

/* ================= billing counter ================= */

export type BillInput = {
  kind: BillKind;
  lines: CartLine[];
  /** "10%" or "50" */
  discount?: string;
  mode: Mode;
  customer?: string;
  phone?: string;
  gstin?: string;
  date?: string;
  /** Set by the counter for every bill: a bill retried after a dropped connection is saved once, not twice. */
  clientId?: string;
  /** Billing a quotation: it is marked Accepted once the bill is saved. */
  quoteId?: string;
  /** loyalty points to use on this bill, 1 point = 1 rupee off */
  redeem?: number;
  /** coupon code from the Offers module */
  coupon?: string;
  /** a return: the invoice it is against, so it can't return more than was sold */
  against?: string;
  /** collect TCS on this bill at the rate in Settings */
  tcs?: boolean;
  /** the owner's PIN, typed at the counter to allow a discount or price beyond the cashier's limits */
  pin?: string;
};

const isoDay = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayIso());

/**
 * Saves a counter bill: one Sales line per item sharing an invoice number (a return saves negative lines, a stock-in
 * saves Purchases marked Received), moves stock, adds a new customer by phone, and runs the automations once for the
 * bill as a whole. Prices come from the request (the cashier may change them) but every total is worked out here.
 */
export async function saveBill(input: BillInput) {
  return attempt(async () => {
    const purchase = input.kind === "purchase" || input.kind === "preturn";
    const moduleId = purchase ? "purchases" : "sales";
    const ctx = await actionCtx(moduleId, { records: true });
    const b = ctx.business;
    // ponytail: one kv row per bill, never cleaned up; prune old "bill:" keys if the table ever grows large
    const dedupe = input.clientId && /^[\w-]{8,64}$/.test(input.clientId) ? `bill:${b.id}:${input.clientId}` : null;
    if (dedupe) { const prior = await getKv(dedupe); if (prior) return JSON.parse(prior) as { no: string; id: string; total: number }; }
    const mod = b.modules.find((m) => m.id === moduleId && m.enabled);
    if (!mod) throw new Error(`Switch on the ${purchase ? "Purchases" : "Sales"} module in Settings first.`);
    if (!["sale", "return", "purchase", "preturn"].includes(input.kind)) throw new Error("Pick sale, return, stock in or supplier return.");
    if (!MODES.includes(input.mode)) throw new Error("Pick how it was paid.");
    if (!Array.isArray(input.lines) || !input.lines.length) throw new Error("Add at least one item.");
    if (input.lines.length > 300) throw new Error("A bill can have up to 300 lines.");
    if (input.mode === "Credit" && !purchase && !input.phone?.trim() && !input.customer?.trim()) throw new Error("A bill on credit needs the customer's name or phone.");

    const stock = new Map((b.records.inventory ?? []).map((r) => [r.id, r]));
    const lines: CartLine[] = input.lines.map((l) => {
      const qty = Number(l.qty), rate = Number(l.rate), disc = Number(l.disc ?? 0);
      if (!(qty > 0 && qty <= 1e6)) throw new Error(`${l.name || "A line"}: enter a quantity above zero.`);
      if (!(rate >= 0 && rate <= 1e9)) throw new Error(`${l.name || "A line"}: enter a price.`);
      if (!(disc >= 0 && disc <= 100)) throw new Error(`${l.name || "A line"}: discount is 0–100%.`);
      const it = l.itemId ? stock.get(l.itemId) : undefined;
      if (l.itemId && !it) throw new Error(`${l.name} is no longer in your stock list. Remove it and add it again.`);
      const name = String(it?.data.name ?? l.name ?? "").trim().slice(0, 200);
      if (!name) throw new Error("Every line needs an item name.");
      return {
        itemId: it?.id, name, qty, rate, disc, serial: String(l.serial ?? "").trim().slice(0, 60) || undefined,
        gst: Number(it?.data.gst_rate ?? l.gst ?? 0) || 0,
        hsn: String(it?.data.hsn ?? l.hsn ?? "") || undefined,
        category: String(it?.data.category ?? l.category ?? "") || undefined,
        cost: Number(it?.data.unit_cost ?? 0) || 0,
      };
    });
    const asked = input.kind === "sale" ? Math.floor(Number(input.redeem) || 0) : 0;
    const redeemer = asked > 0 ? (b.records.customers ?? []).find((r) => String(r.data.phone ?? "").replace(/\D/g, "").slice(-10) === String(input.phone ?? "").replace(/\D/g, "").slice(-10)) : undefined;
    if (asked > 0) {
      if (!redeemer) throw new Error("Points belong to a customer: enter their phone number first.");
      const have = pointsBalance(b.records.sales ?? [], b.records.customers ?? [])[String(redeemer.data.phone ?? "").replace(/\D/g, "").slice(-10)] ?? 0;
      if (asked > have) throw new Error(`${redeemer.data.name ?? "This customer"} has ${have} points, not ${asked}.`);
    }
    const date = isoDay(input.date);
    const items = b.records.inventory ?? [];
    // offers apply to sales only; a return refunds what was charged, a purchase is at cost
    const offered = input.kind === "sale"
      ? applyOffers(lines, String(input.discount ?? ""), b.records.offers ?? [], items, date, String(input.coupon ?? ""))
      : { lines, discount: String(input.discount ?? ""), typed: 0, couponCode: undefined };
    let overridden = "";
    if (input.kind === "sale" && ctx.role.id !== "owner") {
      const why = cashierCheck(offered.lines, offered.typed, items, ctx.role);
      if (why && !(await pinOk(b.id, b.counter?.pinHash, input.pin))) throw new Error(input.pin ? "That PIN isn't the owner's." : why);
      if (why) overridden = why;
    }
    if (input.kind === "sale") for (const l of lines) {
      const it = l.itemId ? stock.get(l.itemId) : undefined;
      if (isExpired(it, date)) throw new Error(`${l.name}${it?.data.batch ? ` (batch ${it.data.batch})` : ""} expired on ${it?.data.expiry}. Expired stock can't be sold: take it off the shelf.`);
      if (b.counter?.blockNegative && it && Number(it.data.on_hand ?? 0) - l.qty < 0) throw new Error(`Only ${Number(it.data.on_hand ?? 0)} of ${l.name} in stock. Selling below zero is switched off in Settings.`);
    }
    const against = input.kind === "return" ? String(input.against ?? "").trim().slice(0, 40) : "";
    if (against) {
      const left = returnable(b.records.sales ?? [], against);
      if (!Object.keys(left).length) throw new Error(`No sale ${against} to return against.`);
      const want: Record<string, number> = {};
      for (const l of lines) { const k = l.name.toLowerCase(); want[k] = (want[k] ?? 0) + l.qty; }
      for (const [k, q] of Object.entries(want))
        if (q > (left[k] ?? 0) + 0.001) throw new Error(`${k}: only ${left[k] ?? 0} can still be returned against ${against}.`);
    }
    const pts = discountWithPoints(offered.lines, offered.discount, asked);
    const bill = priceBill(offered.lines, pts.discount);
    const sign = input.kind === "return" || input.kind === "preturn" ? -1 : 1;
    const party = {
      name: String(input.customer ?? "").trim().slice(0, 120),
      phone: String(input.phone ?? "").replace(/[^\d+]/g, "").slice(0, 15),
      gstin: String(input.gstin ?? "").trim().toUpperCase().slice(0, 15),
    };
    if (input.mode === "Credit" && input.kind === "sale" && party.phone.length >= 10) {
      const last10 = party.phone.slice(-10);
      const cust = (b.records.customers ?? []).find((r) => String(r.data.phone ?? "").replace(/\D/g, "").slice(-10) === last10);
      const limit = Number(cust?.data.credit_limit) || 0;
      const owed = (b.records.sales ?? []).filter((r) => r.data.payment && r.data.payment !== "Paid" && String(r.data.phone ?? "").replace(/\D/g, "").slice(-10) === last10)
        .reduce((t, r) => t + (Number(r.data.amount) || 0), 0);
      if (overLimit(owed, bill.total, limit)) throw new Error(`Over the customer's credit limit of ${limit} (owes ${r2(owed)}). Take part payment, or raise the limit in Customers.`);
    }
    if (party.gstin && !/^\d{2}[A-Z0-9]{13}$/.test(party.gstin)) throw new Error("That GSTIN doesn't look right: 15 characters starting with the 2-digit state code.");
    // a credit bill falls due after the customer's payment terms; TCS, when asked for, is collected on top of the bill
    const cust = !purchase ? customerOf({ phone: party.phone, customer: party.name }, b.records.customers ?? []) : undefined;
    const due = input.kind === "sale" && input.mode === "Credit" ? dueDate(date, Number(cust?.data.payment_terms) || 0) : "";
    const tcs = input.kind === "sale" && input.tcs ? tcsOn(bill.total, b.counter?.tcsRate ?? 0) : 0;
    if (input.tcs && input.kind === "sale" && !tcs) throw new Error("Set the TCS rate in Settings → Business first.");

    const out: Outgoing[] = [];
    const ids = bill.lines.map(() => uid("r_"));
    // ponytail: the stock levels automations see are worked out from the loaded records; the stored ones change
    // atomically below, so a race between two counters can only make a reorder task fire a sale late, never lose stock.
    const moves = new Map<string, number>();
    // stock in and customer returns add stock; sales and supplier returns take it off
    for (const l of bill.lines) if (l.itemId) moves.set(l.itemId, (moves.get(l.itemId) ?? 0) + (purchase ? sign * l.qty : -sign * l.qty));

    const { no, rows } = await updateBusiness(b.id, (x) => {
      ensureCounter(x);
      const m = x.modules.find((y) => y.id === moduleId)!;
      const keys = new Set(m.fields.map((y) => y.key));
      const def = (k: string) => m.fields.find((y) => y.key === k)?.default;
      const prefix = billPrefix(input.kind, date, x.counter?.prefix ?? "");
      x.billSeq ??= {};
      x.billSeq[prefix] = (x.billSeq[prefix] ?? 0) + 1;
      const no = billNo(prefix, x.billSeq[prefix]);
      const rows: RecordRow[] = bill.lines.map((l, i) => {
        const data: Record<string, Value> = purchase ? {
          date, po: no, supplier: party.name || "Counter purchase", item: l.name, quantity: sign * l.qty, amount: r2(sign * l.amount),
          status: sign < 0 ? "Returned" : "Received", gst_rate: String(l.gst ?? 0), supplier_gstin: party.gstin,
        } : {
          date, invoice: no, customer: party.name || (party.phone ? "" : "Walk-in"), item: l.name, category: l.category ?? "",
          quantity: sign * l.qty, amount: r2(sign * l.amount), cost: r2(sign * l.qty * (l.cost ?? 0)),
          payment: input.mode === "Credit" ? "Unpaid" : "Paid", mode: input.mode, gst_rate: String(l.gst ?? 0), hsn: l.hsn ?? "",
          phone: party.phone, customer_gstin: party.gstin, channel: def("channel") ?? "", location: def("location") ?? "",
          against, serial: l.serial ?? "", due, ...(i === 0 && tcs ? { tcs } : {}),
        };
        // only fields this business's module has; blanks left out, as the record form does
        for (const k of Object.keys(data)) if (!keys.has(k) || data[k] === "") delete data[k];
        return { id: ids[i], at: new Date().toISOString(), by: ctx.user.name, data };
      });
      // ponytail: automations run once per bill on a summary (total amount, item count), not per line, so "chase unpaid
      // bills" makes one task; a set_field action changes only the summary. Per-line rules would need their own trigger.
      const summary: RecordRow = { ...rows[0], data: { ...rows[0].data, amount: r2(sign * bill.total), item: rows.length > 1 ? `${rows.length} items` : rows[0].data.item ?? "" } };
      onRecord(x, moduleId, summary, out);
      for (const [id, delta] of moves) {
        const it = stock.get(id)!;
        onRecord(x, "inventory", { ...it, data: { ...it.data, on_hand: r2(Number(it.data.on_hand ?? 0) + delta) } }, out);
      }
      log(x, `${ctx.user.name} ${{ sale: "billed", return: "took a return", purchase: "received stock", preturn: "returned stock to the supplier" }[input.kind]} ${no}: ${bill.lines.length} items, ${r2(bill.total)}`);
      return { no, rows };
    });

    await insertRecords(b.id, moduleId, rows);
    await adjustNumbers(b.id, "on_hand", [...moves].map(([id, delta]) => ({ id, delta })));
    // a new phone at the counter becomes a customer, so the next bill finds them
    const customers = b.modules.find((m) => m.id === "customers" && m.enabled);
    if (!purchase && customers && party.phone && !(b.records.customers ?? []).some((r) => String(r.data.phone ?? "").slice(-10) === party.phone.slice(-10)))
      await insertRecords(b.id, "customers", [{ id: uid("r_"), at: new Date().toISOString(), by: ctx.user.name, data: { since: date, name: party.name || party.phone, phone: party.phone } }]);
    await audit(b.id, { actor: ctx.user.name, action: "create", entity: moduleId, entityId: ids[0], summary: `Counter ${input.kind} ${no}: ${rows.length} lines, total ${r2(bill.total)}${tcs ? ` + TCS ${tcs}` : ""} by ${input.mode}${overridden ? ` (owner PIN: ${overridden})` : ""}${offered.couponCode ? `, coupon ${offered.couponCode}` : ""}${against ? `, against ${against}` : ""}`, after: rows.map((r) => r.data) });
    await deliver(b.id, out);
    if (redeemer && pts.used > 0) await updateRecordData(b.id, redeemer.id, { ...redeemer.data, points_redeemed: (Number(redeemer.data.points_redeemed) || 0) + pts.used });
    if (input.quoteId && !purchase) {
      const q = await getRecord(b.id, String(input.quoteId));
      if (q && q.module === "quotes") await updateRecordData(b.id, q.row.id, { ...q.row.data, status: "Accepted" });
    }
    const result = { no, id: ids[0], total: r2(bill.total + tcs) };
    if (dedupe) await initKv(dedupe, JSON.stringify(result));
    done();
    return result;
  });
}

/**
 * Puts a near-expiry offer live for one stock batch, at the % Insights suggested (checked again here: never below
 * cost + 5%). Switches the Offers module on the first time. The offer ends on the batch's expiry date.
 */
export async function startExpiryOffer(itemId: string) {
  return attempt(async () => {
    const ctx = await actionCtx("inventory", { records: true });
    const b = ctx.business;
    const today = todayIso();
    const advice = expiryAdvice(b.records.inventory ?? [], b.records.offers ?? [], today).find((x) => x.item.id === itemId);
    if (!advice || advice.status !== "suggested") throw new Error("There's no offer to make on this item now.");
    const it = advice.item;
    const ref = String(it.data.sku || it.data.barcode || it.data.name);
    const row: RecordRow = { id: uid("r_"), at: new Date().toISOString(), by: ctx.user.name, data: {
      name: `${it.data.name} near expiry`, kind: "Near-expiry", percent: advice.pct, items: ref, starts: today, ends: String(it.data.expiry), active: "Yes",
    } };
    await updateBusiness(b.id, (x) => {
      ensureCounter(x);
      x.modules.find((m) => m.id === "offers")!.enabled = true;
      log(x, `${ctx.user.name} put ${it.data.name} on ${advice.pct}% off until it expires`);
    });
    await insertRecords(b.id, "offers", [row]);
    await audit(b.id, { actor: ctx.user.name, action: "create", entity: "offers", entityId: row.id, summary: `Near-expiry offer: ${it.data.name} ${advice.pct}% off`, after: row.data });
    done();
    return { pct: advice.pct };
  });
}

/** Switches on modules the books (or another screen) need, e.g. Payments, Journal entries, Fixed assets. */
export async function switchOnModules(ids: string[]) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    await updateBusiness(ctx.business.id, (x) => {
      ensureCounter(x);
      const on = x.modules.filter((m) => ids.includes(m.id) && !m.enabled);
      for (const m of on) m.enabled = true;
      if (on.length) log(x, `${ctx.user.name} switched on ${on.map((m) => m.name).join(", ")}`);
    });
    done();
  });
}

/**
 * Moves stock from one location to another. The same product at another branch or warehouse is its own Stock row
 * (same SKU / barcode, batch and expiry); the first move there creates it. Both sides change in one write.
 */
export async function transferStock(itemId: string, to: string, qty: number) {
  return attempt(async () => {
    const ctx = await actionCtx("inventory", { records: true });
    const b = ctx.business;
    const items = b.records.inventory ?? [];
    const it = items.find((r) => r.id === itemId);
    if (!it) throw new Error("Pick the item to move.");
    const dest = String(to ?? "").trim().slice(0, 60);
    const from = String(it.data.location || "Main");
    if (!dest) throw new Error("Type where it is going.");
    if (dest.toLowerCase() === from.toLowerCase()) throw new Error(`It is already at ${from}.`);
    const q = Number(qty);
    if (!(q > 0)) throw new Error("Enter how many to move.");
    if (q > Number(it.data.on_hand ?? 0)) throw new Error(`Only ${Number(it.data.on_hand ?? 0)} at ${from}.`);
    const same = (r: RecordRow) => r.id !== it.id && String(r.data.location || "Main").toLowerCase() === dest.toLowerCase()
      && ["sku", "barcode", "name", "batch", "expiry"].every((k) => String(r.data[k] ?? "").toLowerCase() === String(it.data[k] ?? "").toLowerCase());
    let target = items.find(same);
    if (!target) {
      target = { id: uid("r_"), at: new Date().toISOString(), by: ctx.user.name, data: { ...it.data, location: dest, on_hand: 0 } };
      await insertRecords(b.id, "inventory", [target]);
    }
    await adjustNumbers(b.id, "on_hand", [{ id: it.id, delta: -q }, { id: target.id, delta: q }]);
    await updateBusiness(b.id, (x) => { log(x, `${ctx.user.name} moved ${q} × ${it.data.name} from ${from} to ${dest}`); });
    await audit(b.id, { actor: ctx.user.name, action: "update", entity: "inventory", entityId: it.id, summary: `Transfer ${q} × ${it.data.name}: ${from} → ${dest}` });
    done();
  });
}

/* ================= owner PIN (counter overrides) ================= */

const hashPin = (pin: string) => { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`; };
/** Checks a typed PIN against the stored hash, five tries per 15 minutes per business. */
async function pinOk(businessId: string, stored: string | undefined, pin: string | undefined) {
  if (!stored || !pin) return false;
  if (!(await allow(`pin:${businessId}`, 5, 15 * 60e3))) throw new Error("Too many wrong PINs. Wait 15 minutes.");
  const [salt, hash] = stored.split(":");
  const ok = timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(String(pin), salt, 32));
  if (ok) await clearAttempts(`pin:${businessId}`);
  return ok;
}

/** The owner sets (or clears, with "") the PIN a cashier's bill needs when it goes beyond their limits. */
export async function setOwnerPin(pin: string) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    if (ctx.role.id !== "owner") throw new Error("Only the owner can set the override PIN.");
    const p = String(pin ?? "").trim();
    if (p && !/^\d{4,8}$/.test(p)) throw new Error("Use 4 to 8 digits.");
    await updateBusiness(ctx.business.id, (b) => { b.counter = { ...b.counter, pinHash: p ? hashPin(p) : undefined }; });
    await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "settings", summary: p ? "Set the owner override PIN" : "Removed the owner override PIN" });
    done();
  });
}

/* ================= Tally masters import ================= */

/**
 * Imports a Tally masters XML: debtors into Customers (with GSTIN, phone, city), stock items into Stock (HSN, GST,
 * cost, opening quantity). Names already there are skipped, so importing twice adds nothing.
 */
export async function importTally(xml: string) {
  return attempt(async () => {
    const ctx = await actionCtx("customers", { records: true });
    const b = ctx.business;
    if (!isTallyXml(String(xml ?? ""))) throw new Error("This doesn't look like a Tally XML export (List of Accounts or Stock Items).");
    const t = parseTallyMasters(String(xml).slice(0, 20_000_000));
    const on = (id: string) => b.modules.some((m) => m.id === id && m.enabled);
    const now = new Date().toISOString();
    const known = (mod: string) => new Set((b.records[mod] ?? []).map((r) => String(r.data.name ?? "").trim().toLowerCase()));
    const kc = known("customers"), ki = known("inventory");
    const clean = (o: Record<string, Value>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== 0));
    const cust = on("customers") ? t.customers.filter((c) => !kc.has(c.name.toLowerCase())).map((c) => ({ id: uid("r_"), at: now, by: "Import",
      data: clean({ since: todayIso(), name: c.name, phone: c.phone, email: c.email, gstin: c.gstin, city: c.city }) })) : [];
    const items = on("inventory") && ctx.can("inventory") ? t.items.filter((i) => !ki.has(i.name.toLowerCase())).map((i) => ({ id: uid("r_"), at: now, by: "Import",
      data: clean({ name: i.name, category: i.category, hsn: i.hsn, gst_rate: i.gst_rate, unit_cost: i.unit_cost, on_hand: i.on_hand, mrp: i.mrp }) })) : [];
    if (cust.length) await insertRecords(b.id, "customers", cust);
    if (items.length) await insertRecords(b.id, "inventory", items);
    const owed = t.customers.filter((c) => c.opening < 0).reduce((s, c) => s - c.opening, 0);
    await audit(b.id, { actor: ctx.user.name, action: "create", entity: "import", summary: `Tally import: ${cust.length} customers, ${items.length} stock items` });
    done();
    return { customers: cust.length, items: items.length, skipped: t.customers.length + t.items.length - cust.length - items.length, suppliers: t.suppliers.length, openingDues: r2(owed) };
  });
}

/** A sale's lines that can still be returned, priced as they were billed: the counter loads them for a return. */
export async function invoiceLines(no: string) {
  return attempt(async () => {
    const ctx = await actionCtx("sales", { records: true, read: true });
    const sales = ctx.business.records.sales ?? [];
    const inv = String(no ?? "").trim();
    const rows = sales.filter((r) => String(r.data.invoice ?? "") === inv && Number(r.data.quantity) > 0);
    if (!rows.length) throw new Error(`No sale ${inv}.`);
    const left = returnable(sales, inv);
    const items = ctx.business.records.inventory ?? [];
    const lines: CartLine[] = [];
    for (const r of rows) {
      const k = String(r.data.item ?? "").trim().toLowerCase(), q = Math.min(Number(r.data.quantity), left[k] ?? 0);
      if (!(q > 0)) continue;
      left[k] -= q;
      const it = items.find((x) => String(x.data.name ?? "").trim().toLowerCase() === k);
      lines.push({ itemId: it?.id, name: String(r.data.item ?? "Item"), qty: q, rate: r2(Number(r.data.amount) / Number(r.data.quantity)), gst: Number(r.data.gst_rate) || 0, hsn: String(r.data.hsn ?? "") || undefined, cost: Number(it?.data.unit_cost) || 0 });
    }
    if (!lines.length) throw new Error(`Everything on ${inv} has already been returned.`);
    return { lines, customer: String(rows[0].data.customer ?? ""), phone: String(rows[0].data.phone ?? "") };
  });
}

/** Closes the day: saves a Z report to the Day close module (switching it on the first time). Closing again adds another. */
export async function closeDay(input: { date: string; opening: number; counted: number; note?: string }) {
  return attempt(async () => {
    const ctx = await actionCtx("sales", { records: true });
    const b = ctx.business;
    const date = isoDay(input.date);
    if (date > todayIso()) throw new Error("You can't close a day that hasn't happened yet.");
    const counted = Number(input.counted), opening = Number(input.opening);
    if (!(counted >= 0) || !(opening >= 0)) throw new Error("Count the cash in the drawer first.");
    const d = dayTotals(b.records.sales ?? [], b.records.expenses ?? [], date, opening);
    const data: Record<string, Value> = {
      date, bills: d.bills, sales: d.sales, returns: d.returns, opening: d.opening, cash: d.byMode.Cash, cash_expenses: d.cashExpenses,
      expected: d.expectedCash, counted: r2(counted), difference: r2(counted - d.expectedCash), upi: d.byMode.UPI, card: d.byMode.Card,
      credit: d.byMode.Credit, closed_by: ctx.user.name, ...(input.note?.trim() ? { note: input.note.trim().slice(0, 300) } : {}),
    };
    const row: RecordRow = { id: uid("r_"), at: new Date().toISOString(), by: ctx.user.name, data };
    const out: Outgoing[] = [];
    await updateBusiness(b.id, (x) => {
      ensureCounter(x);
      x.modules.find((m) => m.id === "dayclose")!.enabled = true;
      onRecord(x, "dayclose", row, out);
      const diff = Number(data.difference);
      log(x, `${ctx.user.name} closed ${date}: cash ${diff ? `${diff > 0 ? "over" : "short"} by ${Math.abs(diff)}` : "matched"}`, diff ? "warn" : "info");
    });
    await insertRecords(b.id, "dayclose", [row]);
    await audit(b.id, { actor: ctx.user.name, action: "create", entity: "dayclose", entityId: row.id, summary: `Closed ${date}`, after: data });
    await deliver(b.id, out);
    done();
    return data;
  });
}

/**
 * Writes the month's pay entries (Pending) for everyone on the Team list who has none yet. Safe to run twice: people
 * already in Payroll for that month are skipped. Pay date is the last day of the month.
 */
export async function runPayroll(month: string) {
  return attempt(async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Pick a month.");
    const ctx = await actionCtx("payroll", { records: true });
    const b = ctx.business;
    if (!b.modules.some((m) => m.id === "employees" && m.enabled)) throw new Error("Switch on the Team module first: pay is worked out from it.");
    const todo = payRun(b.records.employees ?? [], b.records.payroll ?? [], month).filter((l) => !l.done);
    if (!todo.length) throw new Error("Everyone with a salary is already in Payroll for this month.");
    const date = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
    const rows: RecordRow[] = todo.map((l) => ({
      id: uid("r_"), at: new Date().toISOString(), by: ctx.user.name,
      data: { date, employee: l.employee, gross: l.gross, deductions: l.deductions, net: l.net, status: "Pending" },
    }));
    await insertRecords(b.id, "payroll", rows);
    await updateBusiness(b.id, (x) => log(x, `${ctx.user.name} ran payroll for ${month}: ${rows.length} people, net ${r2(rows.reduce((t, r) => t + Number(r.data.net), 0))}`));
    await audit(b.id, { actor: ctx.user.name, action: "create", entity: "payroll", summary: `Pay run ${month}: ${rows.length} entries`, after: rows.map((r) => r.data) });
    done();
    return { added: rows.length };
  });
}

/* ================= restock autopilot ================= */

export async function saveAutoOrder(cfg: { enabled: boolean; weeklyCap: number; suppliers: string[]; leadDays?: number }) {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    if (ctx.role.id !== "owner") throw new Error("Only the owner can let the app place orders.");
    const cap = Math.round(Number(cfg.weeklyCap));
    if (!Number.isFinite(cap) || cap < 0 || cap > 100_000_000) throw new Error("Enter the most you are happy to order each week.");
    const suppliers = [...new Set((cfg.suppliers ?? []).map((s) => String(s).trim().slice(0, 120)).filter(Boolean))].slice(0, 100);
    if (cfg.enabled && (!cap || !suppliers.length)) throw new Error("Pick at least one supplier and a weekly cap above zero.");
    await updateBusiness(ctx.business.id, (b) => {
      // the lead time the owner set on the planner is the one the autopilot plans with
      const lead = Math.round(Number(cfg.leadDays));
      b.autoOrder = { enabled: !!cfg.enabled, weeklyCap: cap, suppliers, leadDays: lead >= 1 && lead <= 30 ? lead : b.autoOrder?.leadDays ?? 3 };
      log(b, `${ctx.user.name} ${cfg.enabled ? `turned restock autopilot on: up to ${cap} a week from ${suppliers.join(", ")}` : "turned restock autopilot off"}`);
    });
    await audit(ctx.business.id, { actor: ctx.user.name, action: "update", entity: "autopilot", summary: cfg.enabled ? `Autopilot on, cap ${cap}/week, ${suppliers.length} suppliers` : "Autopilot off" });
    done();
    return true;
  });
}

/** Runs the autopilot now instead of waiting for the daily clock. */
export async function runAutopilotNow() {
  return attempt(async () => {
    const ctx = await actionCtx("settings");
    if (ctx.role.id !== "owner") throw new Error("Only the owner can run the autopilot.");
    const n = await runAutoOrder(ctx.business.id);
    done();
    return { placed: n };
  });
}
