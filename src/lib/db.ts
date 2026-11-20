/**
 * Storage on libSQL: a local SQLite file by default (`.data/retailx.db`), or Turso when TURSO_DATABASE_URL is set.
 * A business's configuration is one JSON document; records, users, audit entries, tokens and rate-limit hits are rows.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InArgs, type Row } from "@libsql/client";
import { uid, type Business, type BusinessConfig, type PublicUser, type RecordRow, type User, type UserPrefs, type Value } from "@/lib/model";

const SCHEMA = [
  `create table if not exists users (id text primary key, business_id text not null, name text not null, email text unique, phone text unique,
     username text unique, hash text not null, role_id text not null, created_at text not null, email_verified integer default 0,
     phone_verified integer default 0, prefs text default '{}')`,
  `create table if not exists businesses (id text primary key, doc text not null, updated_at text)`,
  `create table if not exists records (id text primary key, business_id text not null, module text not null, data text not null,
     at text not null, by text, sample integer default 0, deleted_at text)`,
  `create index if not exists records_bm on records(business_id, module)`,
  `create table if not exists audit (id text primary key, business_id text not null, at text not null, actor text, action text,
     entity text, entity_id text, summary text, before text, after text)`,
  `create index if not exists audit_b on audit(business_id, at)`,
  `create table if not exists tokens (token text primary key, user_id text not null, kind text not null, code text, expires_at text not null)`,
  `create table if not exists attempts (k text not null, at integer not null)`,
  `create index if not exists attempts_k on attempts(k, at)`,
  `create table if not exists outbox (id text primary key, business_id text, channel text, recipient text, subject text, body text, at text, sent integer)`,
  `create table if not exists push_subs (endpoint text primary key, user_id text not null, sub text not null, created_at text)`,
  `create table if not exists kv (k text primary key, v text not null)`,
];

let ready: Promise<Client> | null = null;

function client(): Promise<Client> {
  ready ??= (async () => {
    let url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      const file = process.env.RETAILX_DB ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "retailx.db");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      url = "file:" + file.replace(/\\/g, "/");
    }
    const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    if (url.startsWith("file:")) await c.execute("pragma journal_mode = wal");
    await c.batch(SCHEMA, "write");
    return c;
  })();
  return ready;
}

// ponytail: one in-process queue for writes, so a write never meets another open write transaction (SQLITE_BUSY),
// plus a short retry for the rare busy that still slips through. Several server processes sharing one SQLite file
// would still contend; that is what Turso (one server-side writer) is for.
let tail: Promise<unknown> = Promise.resolve();
const isBusy = (e: unknown) => /SQLITE_BUSY|database is locked/i.test(String((e as Error)?.message ?? e));
async function retryBusy<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5 || !isBusy(e)) throw e; await new Promise((r) => setTimeout(r, 40 * 2 ** i)); }
  }
}
/** Runs a write after every write queued before it. Never call `serial` from inside a serialized function. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(() => retryBusy(fn));
  tail = run.catch(() => {});
  return run;
}

const q = async (sql: string, args: InArgs = []) => {
  const c = await client();
  return /^\s*(insert|update|delete)/i.test(sql) ? serial(() => c.execute({ sql, args })) : c.execute({ sql, args });
};
const now = () => new Date().toISOString();

/* ---------------- passwords ---------------- */

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

function verifyPassword(pw: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const a = crypto.scryptSync(pw, salt, 64);
  const b = Buffer.from(hex, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- users: one email / phone / username → one user → one role + business ---------------- */

export function normalizeId(raw: string): { kind: "email" | "phone" | "username"; value: string } {
  const v = raw.trim();
  if (v.includes("@")) return { kind: "email", value: v.toLowerCase() };
  const digits = v.replace(/[\s()+-]/g, "");
  // ponytail: last 10 digits, so "+91 98…" and "98…" match; keep the country code once numbers go international
  if (/^\d{7,15}$/.test(digits)) return { kind: "phone", value: digits.slice(-10) };
  return { kind: "username", value: v.toLowerCase() };
}

const toUser = (r: Row): User => ({
  id: String(r.id), businessId: String(r.business_id), name: String(r.name),
  email: (r.email as string) ?? undefined, phone: (r.phone as string) ?? undefined, username: (r.username as string) ?? undefined,
  hash: String(r.hash), roleId: String(r.role_id), createdAt: String(r.created_at),
  emailVerified: !!r.email_verified, phoneVerified: !!r.phone_verified, prefs: JSON.parse(String(r.prefs ?? "{}")) as UserPrefs,
});
const strip = ({ hash: _h, ...u }: User): PublicUser => u;

async function findByIdentifier(raw: string) {
  const { kind, value } = normalizeId(raw);
  const r = await q(`select * from users where ${kind} = ?`, [value]);
  return r.rows[0] ? toUser(r.rows[0]) : null;
}

export async function findUser(identifier: string): Promise<PublicUser | null> {
  const u = await findByIdentifier(identifier);
  return u ? strip(u) : null;
}

export async function authenticate(identifier: string, password: string): Promise<User | null> {
  const u = await findByIdentifier(identifier);
  return u && verifyPassword(password, u.hash) ? u : null;
}

export async function getUser(id: string): Promise<PublicUser | null> {
  const r = await q("select * from users where id = ?", [id]);
  return r.rows[0] ? strip(toUser(r.rows[0])) : null;
}

export async function listUsers(businessId: string): Promise<PublicUser[]> {
  return (await q("select * from users where business_id = ? order by created_at", [businessId])).rows.map((r) => strip(toUser(r)));
}

export type NewUser = { name: string; email?: string; phone?: string; username?: string; password: string; roleId: string };

async function assertFree(n: Partial<NewUser>, exceptUserId?: string) {
  for (const raw of [n.email, n.phone, n.username]) {
    if (!raw) continue;
    const hit = await findByIdentifier(raw);
    if (hit && hit.id !== exceptUserId) throw new Error(`${raw} is already linked to another account.`);
  }
}

const userArgs = (businessId: string, n: NewUser, id = uid("u_")) => [
  id, businessId, n.name.trim(),
  n.email ? normalizeId(n.email).value : null, n.phone ? normalizeId(n.phone).value : null, n.username ? n.username.trim().toLowerCase() : null,
  hashPassword(n.password), n.roleId, now(),
];
const INSERT_USER = "insert into users (id, business_id, name, email, phone, username, hash, role_id, created_at) values (?,?,?,?,?,?,?,?,?)";

export async function createAccount(owner: Omit<NewUser, "roleId">, businessName: string, base: BusinessConfig): Promise<User> {
  await assertFree(owner);
  const business: Omit<Business, "records"> = {
    ...base, id: uid("b_"), name: businessName.trim(), createdAt: now(), onboarded: false,
    tasks: [], activity: [], threads: {},
  };
  const id = uid("u_");
  const c = await client();
  await serial(() => c.batch([
    { sql: "insert into businesses (id, doc, updated_at) values (?,?,?)", args: [business.id, JSON.stringify(business), now()] },
    { sql: INSERT_USER, args: userArgs(business.id, { ...owner, roleId: "owner" }, id) },
  ], "write"));
  return (await authenticate(owner.email ?? owner.phone ?? owner.username!, owner.password))!;
}

export async function addUser(businessId: string, n: NewUser): Promise<PublicUser> {
  await assertFree(n);
  const args = userArgs(businessId, n);
  await q(INSERT_USER, args);
  return (await getUser(String(args[0])))!;
}

export async function updateUser(businessId: string, id: string, patch: Partial<NewUser>) {
  const u = (await q("select * from users where id = ? and business_id = ?", [id, businessId])).rows[0];
  if (!u) throw new Error("No such member.");
  await assertFree(patch, id);
  const sets: string[] = [], args: (string | null)[] = [];
  if (patch.name) { sets.push("name = ?"); args.push(patch.name.trim()); }
  if (patch.roleId) { sets.push("role_id = ?"); args.push(patch.roleId); }
  if (patch.password) { sets.push("hash = ?"); args.push(hashPassword(patch.password)); }
  for (const k of ["email", "phone", "username"] as const) {
    if (patch[k] === undefined) continue;
    sets.push(`${k} = ?`);
    args.push(patch[k] ? normalizeId(patch[k]!).value : null);
    if (k !== "username") sets.push(`${k}_verified = 0`); // a changed address has to be verified again
  }
  if (sets.length) await q(`update users set ${sets.join(", ")} where id = ?`, [...args, id]);
}

export async function setPassword(userId: string, password: string) {
  await q("update users set hash = ? where id = ?", [hashPassword(password), userId]);
}

export async function markVerified(userId: string, kind: "email" | "phone") {
  await q(`update users set ${kind}_verified = 1 where id = ?`, [userId]);
}

export async function saveUserPrefs(userId: string, patch: Partial<UserPrefs>) {
  const u = await getUser(userId);
  if (!u) return;
  await q("update users set prefs = ? where id = ?", [JSON.stringify({ ...u.prefs, ...patch }), userId]);
}

export async function removeUser(businessId: string, id: string) {
  await q("delete from users where id = ? and business_id = ?", [id, businessId]);
}

/* ---------------- businesses ---------------- */

const toRow = (r: Row): RecordRow => ({
  id: String(r.id), at: String(r.at), by: String(r.by ?? ""), data: JSON.parse(String(r.data)) as Record<string, Value>,
  ...(r.sample ? { sample: true } : {}),
});

// ponytail: every request loads all live records of the business; fine at MSME scale (tens of thousands of rows),
// push aggregation into SQL if a business outgrows it.
async function loadRecords(businessId: string) {
  const rows = (await q("select * from records where business_id = ? and deleted_at is null order by at desc", [businessId])).rows;
  const out: Record<string, RecordRow[]> = {};
  for (const r of rows) (out[String(r.module)] ??= []).push(toRow(r));
  return out;
}

export async function getBusiness(id: string, opts: { records?: boolean } = {}): Promise<Business | null> {
  const r = (await q("select doc from businesses where id = ?", [id])).rows[0];
  if (!r) return null;
  const b = JSON.parse(String(r.doc)) as Business;
  b.records = opts.records === false ? {} : await loadRecords(id);
  return b;
}

export async function listBusinessIds(): Promise<string[]> {
  return (await q("select id from businesses")).rows.map((r) => String(r.id));
}

/**
 * Read-modify-write a business document in one write transaction, so concurrent requests can't lose each other's
 * changes. Records are loaded for `fn` to read when asked, but only the document is written back.
 */
export async function updateBusiness<T>(id: string, fn: (b: Business) => T, opts: { records?: boolean } = {}): Promise<T> {
  const records = opts.records ? await loadRecords(id) : {};
  const c = await client();
  return serial(() => writeDoc(c, id, records, fn));
}

async function writeDoc<T>(c: Client, id: string, records: Business["records"], fn: (b: Business) => T): Promise<T> {
  const tx = await c.transaction("write");
  try {
    const r = (await tx.execute({ sql: "select doc from businesses where id = ?", args: [id] })).rows[0];
    if (!r) throw new Error("Business not found.");
    const b = JSON.parse(String(r.doc)) as Business;
    b.records = records;
    const out = fn(b);
    const { records: _r, ...doc } = b;
    await tx.execute({ sql: "update businesses set doc = ?, updated_at = ? where id = ?", args: [JSON.stringify(doc), now(), id] });
    await tx.commit();
    return out;
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}

/* ---------------- records ---------------- */

export async function insertRecords(businessId: string, module: string, rows: RecordRow[]) {
  const c = await client();
  for (let i = 0; i < rows.length; i += 500)
    await serial(() => c.batch(rows.slice(i, i + 500).map((r) => ({
      sql: "insert into records (id, business_id, module, data, at, by, sample) values (?,?,?,?,?,?,?)",
      args: [r.id, businessId, module, JSON.stringify(r.data), r.at, r.by, r.sample ? 1 : 0],
    })), "write"));
}

/**
 * Adds `delta` to a number field of each record in one write transaction, in SQL, so two counters selling the same
 * item at once both count. Returns the new values by record id.
 */
export async function adjustNumbers(businessId: string, field: string, changes: { id: string; delta: number }[]) {
  if (!changes.length) return {} as Record<string, number>;
  if (!/^[a-z0-9_]+$/.test(field)) throw new Error("Bad field name.");
  const c = await client();
  const res = await serial(() => c.batch(changes.map((x) => ({
    sql: `update records set data = json_set(data, '$.${field}', coalesce(json_extract(data, '$.${field}'), 0) + ?)
          where id = ? and business_id = ? returning id, json_extract(data, '$.${field}') as v`,
    args: [x.delta, x.id, businessId],
  })), "write"));
  return Object.fromEntries(res.flatMap((r) => r.rows.map((row) => [String(row.id), Number(row.v)])));
}

export async function getRecord(businessId: string, id: string) {
  const r = (await q("select * from records where id = ? and business_id = ?", [id, businessId])).rows[0];
  return r ? { module: String(r.module), row: toRow(r), deletedAt: (r.deleted_at as string) ?? null } : null;
}

export async function updateRecordData(businessId: string, id: string, data: Record<string, Value>) {
  await q("update records set data = ? where id = ? and business_id = ?", [JSON.stringify(data), id, businessId]);
}

export async function setDeleted(businessId: string, id: string, deleted: boolean) {
  await q("update records set deleted_at = ? where id = ? and business_id = ?", [deleted ? now() : null, id, businessId]);
}

export async function listDeleted(businessId: string, module: string) {
  const rows = (await q("select * from records where business_id = ? and module = ? and deleted_at is not null order by deleted_at desc limit 200", [businessId, module])).rows;
  return rows.map((r) => ({ ...toRow(r), deletedAt: String(r.deleted_at) }));
}

/** Bin entries older than 30 days are removed for good. */
export async function purgeDeleted(businessId: string) {
  await q("delete from records where business_id = ? and deleted_at < ?", [businessId, new Date(Date.now() - 30 * 864e5).toISOString()]);
}

export async function removeSampleRecords(businessId: string) {
  return (await q("delete from records where business_id = ? and sample = 1", [businessId])).rowsAffected;
}

/* ---------------- audit trail ---------------- */

export type AuditEntry = { actor: string; action: string; entity: string; entityId?: string; summary: string; before?: unknown; after?: unknown };

export async function audit(businessId: string, ...entries: AuditEntry[]) {
  if (!entries.length) return;
  const c = await client();
  await serial(() => c.batch(entries.map((e) => ({
    sql: "insert into audit (id, business_id, at, actor, action, entity, entity_id, summary, before, after) values (?,?,?,?,?,?,?,?,?,?)",
    args: [uid("ad_"), businessId, now(), e.actor, e.action, e.entity, e.entityId ?? null, e.summary,
      e.before === undefined ? null : JSON.stringify(e.before), e.after === undefined ? null : JSON.stringify(e.after)],
  })), "write"));
}

export async function listAudit(businessId: string, opts: { entityId?: string; limit?: number } = {}) {
  const rows = (await q(
    `select * from audit where business_id = ? ${opts.entityId ? "and entity_id = ?" : ""} order by at desc limit ?`,
    opts.entityId ? [businessId, opts.entityId, opts.limit ?? 200] : [businessId, opts.limit ?? 200],
  )).rows;
  return rows.map((r) => ({
    id: String(r.id), at: String(r.at), actor: String(r.actor ?? ""), action: String(r.action), entity: String(r.entity),
    entityId: (r.entity_id as string) ?? undefined, summary: String(r.summary ?? ""),
    before: r.before ? JSON.parse(String(r.before)) : undefined, after: r.after ? JSON.parse(String(r.after)) : undefined,
  }));
}

/* ---------------- one-time tokens (password reset, verification codes) ---------------- */

export async function createToken(userId: string, kind: "reset" | "verify-email" | "verify-phone", minutes = 30) {
  const token = crypto.randomBytes(24).toString("base64url");
  const code = String(crypto.randomInt(100000, 1000000));
  await q("delete from tokens where user_id = ? and kind = ?", [userId, kind]);
  await q("insert into tokens (token, user_id, kind, code, expires_at) values (?,?,?,?,?)",
    [token, userId, kind, code, new Date(Date.now() + minutes * 60e3).toISOString()]);
  return { token, code };
}

/** Consumes a token (by link token, or by user + 6-digit code); returns the user id if valid. */
export async function consumeToken(kind: string, by: { token: string } | { userId: string; code: string }): Promise<string | null> {
  const r = ("token" in by
    ? await q("select * from tokens where token = ? and kind = ?", [by.token, kind])
    : await q("select * from tokens where user_id = ? and code = ? and kind = ?", [by.userId, by.code, kind])).rows[0];
  if (!r || String(r.expires_at) < now()) return null;
  await q("delete from tokens where token = ?", [String(r.token)]);
  return String(r.user_id);
}

/* ---------------- rate limiting ---------------- */

/** Records a hit for `key`; false once there are more than `max` hits within `windowMs`. */
export async function allow(key: string, max: number, windowMs: number): Promise<boolean> {
  const t = Date.now();
  await q("delete from attempts where at < ?", [t - 24 * 3600e3]);
  const n = Number((await q("select count(*) as n from attempts where k = ? and at > ?", [key, t - windowMs])).rows[0].n);
  if (n >= max) return false;
  await q("insert into attempts (k, at) values (?, ?)", [key, t]);
  return true;
}

export async function clearAttempts(key: string) {
  await q("delete from attempts where k = ?", [key]);
}

/* ---------------- outbox (every email / WhatsApp the system sends or would send) ---------------- */

export async function logOutbox(m: { businessId?: string; channel: string; recipient: string; subject?: string; body: string; sent: boolean }) {
  await q("insert into outbox (id, business_id, channel, recipient, subject, body, at, sent) values (?,?,?,?,?,?,?,?)",
    [uid("m_"), m.businessId ?? null, m.channel, m.recipient, m.subject ?? null, m.body, now(), m.sent ? 1 : 0]);
}

export async function listOutbox(businessId: string, limit = 50) {
  return (await q("select * from outbox where business_id = ? order by at desc limit ?", [businessId, limit])).rows.map((r) => ({
    id: String(r.id), channel: String(r.channel), recipient: String(r.recipient), subject: (r.subject as string) ?? "", body: String(r.body), at: String(r.at), sent: !!r.sent,
  }));
}

/* ---------------- push subscriptions & settings ---------------- */

export async function getKv(k: string) {
  return ((await q("select v from kv where k = ?", [k])).rows[0]?.v as string) ?? null;
}

/** Sets `k` only if unset, and returns whichever value won (two processes generating keys agree on one). */
export async function initKv(k: string, v: string) {
  await q("insert into kv (k, v) values (?, ?) on conflict(k) do nothing", [k, v]);
  return (await getKv(k))!;
}

export async function savePushSub(userId: string, sub: { endpoint: string }) {
  await q("insert into push_subs (endpoint, user_id, sub, created_at) values (?,?,?,?) on conflict(endpoint) do update set user_id = excluded.user_id, sub = excluded.sub",
    [sub.endpoint, userId, JSON.stringify(sub), now()]);
}

/** With `userId`, only that user's own subscription; without, any (a push service said it's gone). */
export async function removePushSub(endpoint: string, userId?: string) {
  await q(`delete from push_subs where endpoint = ?${userId ? " and user_id = ?" : ""}`, userId ? [endpoint, userId] : [endpoint]);
}

export async function pushSubsFor(userIds: string[]) {
  if (!userIds.length) return [];
  const rows = (await q(`select * from push_subs where user_id in (${userIds.map(() => "?").join(",")})`, userIds)).rows;
  return rows.map((r) => ({ userId: String(r.user_id), endpoint: String(r.endpoint), sub: JSON.parse(String(r.sub)) }));
}
