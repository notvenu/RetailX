"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addMember, removeMember, saveConfig, setOwnerPin, updateMember, type Invite } from "@/app/actions";
import { COUNTRIES, GOALS, INDUSTRIES, industryById } from "@/lib/catalog";
import { ago } from "@/lib/format";
import { todayIso } from "@/lib/metrics";
import { LANGS } from "@/lib/i18n";
import { FESTIVALS } from "@/lib/planning";
import { uid, type BizEvent, type BusinessConfig, type Lang, type PublicUser } from "@/lib/model";
import { ModulesEditor } from "@/components/config/modules";
import { KpiEditor } from "@/components/config/kpis";
import { IntelligenceEditor } from "@/components/config/intelligence";
import { AiRolesEditor } from "@/components/config/ai-roles";
import { RolesMatrix } from "@/components/config/team";
import { ThemeEditor } from "@/components/config/theme";
import { Chip, Label, Section, Segmented, Toggle, btnGhost, btnPrimary, btnQuiet, control } from "@/components/ui";
import { failed, ok } from "@/lib/result";

const TABS = [
  { id: "business", label: "Business" }, { id: "counter", label: "Counter & invoices" }, { id: "modules", label: "Modules" }, { id: "kpis", label: "KPIs" },
  { id: "intelligence", label: "Forecasts & analytics" }, { id: "calendar", label: "Calendar" }, { id: "ai", label: "AI team" },
  { id: "team", label: "Team & access" }, { id: "theme", label: "Look & feel" }, { id: "audit", label: "Audit log" },
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type AuditRow = { id: string; at: string; actor: string; action: string; entity: string; summary: string };

export function SettingsPanel({ config, members, me, initialTab, audit, owner = false, hasPin = false }: {
  config: BusinessConfig; members: PublicUser[]; me: string; initialTab: string; audit: AuditRow[]; owner?: boolean; hasPin?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : "business");
  const [c, setC] = useState(config);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const set = (p: Partial<BusinessConfig>) => { setC({ ...c, ...p }); setDirty(true); setMsg(""); };
  const ind = industryById(c.industry);

  return (
    <div className="pb-24">
      {/* the draft theme previews live; it unmounts (and reverts) if you leave without saving */}
      <nav aria-label="Settings sections" className="mt-5 flex gap-1 overflow-x-auto border-b border-rule">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); router.replace(`/settings?tab=${t.id}`, { scroll: false }); }} aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-[0.82rem] transition-colors ${tab === t.id ? "border-accent font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>{t.label}</button>
        ))}
      </nav>

      <div className="mt-7">
        {tab === "business" && (
          <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label text="Business name"><input className={control} value={c.name} onChange={(e) => set({ name: e.target.value })} /></Label></div>
            <Label text="Industry" hint="Changing industry doesn't remove modules; add or switch them under Modules.">
              <select className={control} value={c.industry} onChange={(e) => set({ industry: e.target.value, category: industryById(e.target.value).categories[0].name })}>
                {INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Label>
            <Label text="Category">
              <input className={control} list="rx-cats" value={c.category} onChange={(e) => set({ category: e.target.value })} />
              <datalist id="rx-cats">{ind.categories.map((x) => <option key={x.name} value={x.name} />)}</datalist>
            </Label>
            <Label text="Country">
              <select className={control} value={c.country} onChange={(e) => set({ country: e.target.value })}>{COUNTRIES.map((x) => <option key={x.name}>{x.name}</option>)}</select>
            </Label>
            <Label text="City"><input className={control} value={c.city} onChange={(e) => set({ city: e.target.value })} /></Label>
            <Label text="Currency"><input className={control} value={c.currency} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} /></Label>
            <Label text="Financial year starts">
              <select className={control} value={c.fiscalStart} onChange={(e) => set({ fiscalStart: +e.target.value })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            </Label>
            <Label text="Locations"><input type="number" min={1} className={control} value={c.profile.locations} onChange={(e) => set({ profile: { ...c.profile, locations: Math.max(1, +e.target.value) } })} /></Label>
            <Label text="Team size"><Segmented label="Team size" value={c.profile.size} options={["Just me", "2–10", "11–50", "51–200", "200+"].map((s) => ({ value: s, label: s }))} onChange={(v) => set({ profile: { ...c.profile, size: v } })} /></Label>
            <div className="sm:col-span-2">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Goals (your AI team coaches toward these)</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {GOALS.map((g) => <Chip key={g} on={c.profile.goals.includes(g)} onClick={() => set({ profile: { ...c.profile, goals: c.profile.goals.includes(g) ? c.profile.goals.filter((x) => x !== g) : [...c.profile.goals, g] } })}>{g}</Chip>)}
              </div>
            </div>
            <Label text="GSTIN" hint="On invoices; its first two digits decide CGST+SGST vs IGST.">
              <input className={`${control} uppercase`} maxLength={15} value={c.gstin ?? ""} onChange={(e) => set({ gstin: e.target.value.toUpperCase() || undefined, state: e.target.value.slice(0, 2) || undefined })} placeholder="27ABCDE1234F1Z5" />
            </Label>
            <Label text="UPI ID" hint="For payment links and QR codes on invoices.">
              <input className={control} value={c.upiId ?? ""} onChange={(e) => set({ upiId: e.target.value.trim() || undefined })} placeholder="yourshop@okicici" />
            </Label>
            <Label text="Default language" hint="Each person can switch their own in the user menu.">
              <select className={control} value={c.language ?? "en"} onChange={(e) => set({ language: e.target.value as Lang })}>
                {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </Label>
            <Label text="Invoice prefix" hint="Up to 8 letters, e.g. VJA → VJA/26-27/0001. Blank = 26-27/0001.">
              <input className={`${control} uppercase`} maxLength={8} value={c.counter?.prefix ?? ""} onChange={(e) => set({ counter: { ...c.counter, prefix: e.target.value.toUpperCase() } })} placeholder="VJA" />
            </Label>
            <Label text="Receipt printer" hint="Paper width of the counter's thermal printer.">
              <Segmented label="Receipt width" value={c.counter?.receipt ?? "80mm"} options={[{ value: "80mm", label: "80 mm" }, { value: "58mm", label: "58 mm" }]} onChange={(v) => set({ counter: { ...c.counter, receipt: v } })} />
            </Label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Toggle on={!!c.counter?.blockNegative} onChange={(v) => set({ counter: { ...c.counter, blockNegative: v } })} label="Stop sales below zero stock" />
              <span className="text-[0.84rem] text-ink-soft">Refuse a sale that would take an item&apos;s stock below zero</span>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Toggle on={c.profile.credit} onChange={(v) => set({ profile: { ...c.profile, credit: v } })} label="Sells on credit" />
              <span className="text-[0.84rem] text-ink-soft">Customers sometimes pay later</span>
            </div>
          </div>
        )}
        {tab === "counter" && <CounterSettings c={c} set={set} owner={owner} hasPin={hasPin} />}
        {tab === "modules" && <ModulesEditor modules={c.modules} recommended={ind.modules} onChange={(modules) => set({ modules })} />}
        {tab === "kpis" && <KpiEditor kpis={c.kpis} modules={c.modules} onChange={(kpis) => set({ kpis })} />}
        {tab === "intelligence" && <IntelligenceEditor forecasts={c.forecasts} analytics={c.analytics} kpis={c.kpis} modules={c.modules} onChange={(p) => set(p)} />}
        {tab === "ai" && <AiRolesEditor roles={c.aiRoles} kpis={c.kpis} onChange={(aiRoles) => set({ aiRoles })} />}
        {tab === "team" && (
          <div className="space-y-2">
            <Members members={members} roles={c.roles} me={me} />
            <Section title="Roles and access">
              <p className="mb-3 text-[0.78rem] text-ink-soft">Tick what each role can open. Sign-in never asks for a role: each person&apos;s login carries theirs.</p>
              <RolesMatrix roles={c.roles} modules={c.modules} onChange={(roles) => set({ roles })} />
            </Section>
          </div>
        )}
        {tab === "theme" && <ThemeEditor theme={c.theme} onChange={(theme) => set({ theme })} />}
        {tab === "calendar" && <Calendar events={c.events ?? []} onChange={(events) => set({ events })} />}
        {tab === "audit" && <AuditLog rows={audit} />}
      </div>

      {dirty || msg ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1240px] items-center justify-end gap-3 px-6 py-3">
            {msg ? <span className="mr-auto text-[0.8rem] text-good">{msg}</span> : <span className="mr-auto text-[0.8rem] text-ink-soft">You have unsaved changes.</span>}
            {dirty ? <button className={btnQuiet} onClick={() => { setC(config); setDirty(false); }}>Discard</button> : null}
            {dirty ? (
              <button className={btnPrimary} disabled={pending} onClick={() => start(async () => {
                try {
                  // automations and the dashboard have their own screens; don't overwrite edits made there meanwhile
                  const { automations: _a, dashboard: _d, ...rest } = c;
                  ok(await saveConfig(rest)); setDirty(false); setMsg("Saved. Your team sees the changes now."); } catch (e) { setMsg(""); alert((e as Error).message); }
              })}>{pending ? "Saving…" : "Save changes"}</button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Members({ members, roles, me }: { members: PublicUser[]; roles: BusinessConfig["roles"]; me: string }) {
  const [adding, setAdding] = useState<Invite | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { setError(""); try { ok(await fn()); } catch (e) { setError((e as Error).message); } });
  const ident = (v: string): Partial<Invite> =>
    v.includes("@") ? { email: v, phone: undefined, username: undefined } : /^[+\d\s()-]{7,}$/.test(v) ? { phone: v, email: undefined, username: undefined } : { username: v, email: undefined, phone: undefined };

  return (
    <Section title="People" meta={`${members.length} with access`}>
      <ul className="divide-y divide-rule border-b border-rule">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[0.82rem]">
            <span className="grid size-8 place-items-center rounded-full bg-accent-wash text-[0.72rem] font-semibold text-accent">{m.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink">{m.name}{m.id === me ? <span className="ml-1 text-ink-faint">(you)</span> : null}</span>
              <span className="block text-[0.74rem] text-ink-faint">{[m.email, m.phone, m.username && `@${m.username}`].filter(Boolean).join(" · ")}</span>
            </span>
            <select aria-label={`${m.name}'s role`} className={`${control} w-36`} value={m.roleId} disabled={m.id === me || pending}
              onChange={(e) => run(() => updateMember(m.id, { roleId: e.target.value }))}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button className={btnQuiet} disabled={pending} onClick={() => { const pw = prompt(`New password for ${m.name} (8+ characters)`); if (pw) run(() => updateMember(m.id, { password: pw })); }}>Reset password</button>
            {m.id !== me ? <button className={btnQuiet} aria-label={`Remove ${m.name}`} disabled={pending} onClick={() => confirm(`Remove ${m.name}? They lose access immediately.`) && run(() => removeMember(m.id))}><Trash2 className="size-3.5" /></button> : null}
          </li>
        ))}
      </ul>
      {adding ? (
        <form className="mt-3 grid gap-2 border border-rule bg-panel/50 p-3 sm:grid-cols-[1fr_1.2fr_9rem_9rem_auto]"
          onSubmit={(e) => { e.preventDefault(); run(async () => { ok(await addMember(adding)); setAdding(null); }); }}>
          <input aria-label="Name" required className={control} placeholder="Name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
          <input aria-label="Email, phone or username" required className={control} placeholder="Email, phone or username" onChange={(e) => setAdding({ ...adding, ...ident(e.target.value) })} />
          <select aria-label="Role" className={control} value={adding.roleId} onChange={(e) => setAdding({ ...adding, roleId: e.target.value })}>
            {roles.filter((r) => r.id !== "owner").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input aria-label="Temporary password" required minLength={8} className={`${control} font-mono`} value={adding.password} onChange={(e) => setAdding({ ...adding, password: e.target.value })} />
          <div className="flex gap-1"><button className={btnPrimary} disabled={pending}>Add</button><button type="button" className={btnQuiet} onClick={() => setAdding(null)}>Cancel</button></div>
        </form>
      ) : (
        <button className={`${btnGhost} mt-3`} onClick={() => setAdding({ name: "", roleId: roles.find((r) => r.id !== "owner")?.id ?? "staff", password: Math.random().toString(36).slice(2, 7) + "-" + Math.random().toString(36).slice(2, 7) })}>
          <Plus className="size-3.5" /> Add a person
        </button>
      )}
      {error ? <p role="alert" className="mt-2 text-[0.8rem] text-bad">{error}</p> : null}
    </Section>
  );
}

/** Festivals, sales and promotions: forecasts learn their effect, anomaly checks leave them alone. */
function Calendar({ events, onChange }: { events: BizEvent[]; onChange: (e: BizEvent[]) => void }) {
  const set = (i: number, p: Partial<BizEvent>) => onChange(events.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const missing = FESTIVALS.filter((f) => !events.some((e) => e.name === f.name && e.date === f.date));
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="max-w-3xl">
      <p className="text-[0.82rem] text-ink-soft">Days that are expected to be different. Daily forecasts with “learn festivals” on use how past events moved your sales; the anomaly log skips them.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btnGhost} onClick={() => onChange([...events, { id: uid("ev_"), date: todayIso(), name: "Promotion", days: 1 }])}><Plus className="size-3.5" /> Add event</button>
        {missing.length ? <button type="button" className={btnGhost} onClick={() => onChange([...events, ...missing.map((f) => ({ ...f, id: uid("ev_") }))])}>Add Indian festivals ({missing.length})</button> : null}
      </div>
      <p className="mt-2 text-[0.74rem] text-ink-faint">Lunar festival dates move each year and the built-in ones are approximate. Check them against your local calendar.</p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {sorted.map((e) => {
          const i = events.indexOf(e);
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
              <input aria-label="Date" type="date" className={control} value={e.date} onChange={(x) => set(i, { date: x.target.value })} />
              <input aria-label="Name" className={`${control} min-w-[12rem] flex-1`} value={e.name} onChange={(x) => set(i, { name: x.target.value })} />
              <label className="flex items-center gap-1.5 text-[0.78rem] text-ink-soft">for
                <input aria-label="Days" type="number" min={1} max={30} className={`${control} w-16 text-right`} value={e.days ?? 1} onChange={(x) => set(i, { days: Math.max(1, +x.target.value) })} /> day(s)
              </label>
              <button type="button" className={btnQuiet} aria-label={`Remove ${e.name}`} onClick={() => onChange(events.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
            </li>
          );
        })}
        {!events.length ? <li className="py-6 text-center text-[0.8rem] text-ink-faint">No events yet.</li> : null}
      </ul>
    </div>
  );
}

function AuditLog({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState("");
  const shown = rows.filter((r) => !q || `${r.actor} ${r.summary} ${r.entity}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[0.82rem] text-ink-soft">Who changed what: records, settings, team, automations and approvals. Most recent first.</p>
        <input aria-label="Search audit log" className={`${control} w-56`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="divide-y divide-rule border-y border-rule text-[0.82rem]">
        {shown.map((r) => (
          <li key={r.id} className="grid grid-cols-[7rem_8rem_1fr] gap-3 py-2">
            <span suppressHydrationWarning className="text-ink-faint" title={r.at}>{ago(r.at)}</span>
            <span className="truncate text-ink">{r.actor}</span>
            <span className="text-ink-soft"><span className="mr-1.5 rounded-sm bg-panel px-1 text-[0.66rem] uppercase text-ink-faint">{r.action}</span>{r.summary}</span>
          </li>
        ))}
        {!shown.length ? <li className="py-6 text-center text-ink-faint">Nothing recorded yet.</li> : null}
      </ul>
    </div>
  );
}

/** Counter and invoice settings, the owner's override PIN, and the optional product features. */
function CounterSettings({ c, set, owner, hasPin }: { c: BusinessConfig; set: (p: Partial<BusinessConfig>) => void; owner: boolean; hasPin: boolean }) {
  const k = c.counter ?? {};
  const setK = (p: Partial<NonNullable<BusinessConfig["counter"]>>) => set({ counter: { ...k, ...p } });
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v) || 0);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [pinBusy, startPin] = useTransition();
  const router = useRouter();
  const feat = c.features ?? {};
  return (
    <div className="space-y-2">
      <Section title="Invoices">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Label text="A4 invoice layout" hint="Receipts on the thermal printer keep their own layout.">
            <Segmented label="Invoice layout" value={k.layout ?? "classic"} onChange={(layout) => setK({ layout })}
              options={[{ value: "classic", label: "Classic" }, { value: "modern", label: "Modern" }, { value: "compact", label: "Compact" }]} />
          </Label>
          <Label text="TCS % on bills" hint="Offered at the counter as a tick box, e.g. 0.1. Blank = off.">
            <input className={control} inputMode="decimal" value={k.tcsRate ?? ""} onChange={(e) => setK({ tcsRate: num(e.target.value) })} placeholder="0.1" />
          </Label>
          <Label text="Bank details on invoices"><textarea rows={2} className={control} value={k.bank ?? ""} onChange={(e) => setK({ bank: e.target.value })} placeholder="HDFC Bank · A/c 50200012345678 · IFSC HDFC0001234" /></Label>
          <Label text="Terms on invoices"><textarea rows={2} className={control} value={k.terms ?? ""} onChange={(e) => setK({ terms: e.target.value })} placeholder="Goods once sold are exchanged within 7 days with the bill." /></Label>
        </div>
      </Section>
      <Section title="Staff and referrals">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Label text="Staff incentive % of net sales" hint="Reports → Staff & referrals works it out per person who billed."><input className={control} inputMode="decimal" value={k.incentivePct ?? ""} onChange={(e) => setK({ incentivePct: num(e.target.value) })} placeholder="1" /></Label>
          <Label text="Referral commission %" hint="On what customers someone referred bought (Customers → Referred by)."><input className={control} inputMode="decimal" value={k.referralPct ?? ""} onChange={(e) => setK({ referralPct: num(e.target.value) })} placeholder="2" /></Label>
        </div>
      </Section>
      <Section title="Owner override PIN">
        <p className="mb-2 max-w-2xl text-[0.8rem] text-ink-soft">When a cashier&apos;s bill goes past their discount or price limit (Team &amp; access), the owner types this PIN at the counter to allow it. The bill&apos;s audit entry says so. {hasPin ? "A PIN is set." : "No PIN is set."}</p>
        {owner ? (
          <div className="flex flex-wrap items-center gap-2">
            <input type="password" inputMode="numeric" autoComplete="new-password" aria-label="New owner PIN" className={`${control} w-40`} placeholder="4–8 digits" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            <button type="button" className={btnGhost} disabled={pinBusy || pin.length < 4} onClick={() => startPin(async () => { const r = await setOwnerPin(pin); setPinMsg(failed(r) ? r.__error : "PIN saved."); setPin(""); router.refresh(); })}>Save PIN</button>
            {hasPin ? <button type="button" className={btnQuiet} disabled={pinBusy} onClick={() => startPin(async () => { const r = await setOwnerPin(""); setPinMsg(failed(r) ? r.__error : "PIN removed."); router.refresh(); })}>Remove PIN</button> : null}
            {pinMsg ? <span className="text-[0.8rem] text-ink-soft">{pinMsg}</span> : null}
          </div>
        ) : <p className="text-[0.8rem] text-ink-faint">Only the owner can set it.</p>}
      </Section>
      <Section title="Product features">
        <div className="grid max-w-3xl gap-3">
          <label className="flex items-start gap-3">
            <Toggle on={!!feat.certificates} onChange={(v) => set({ features: { ...feat, certificates: v } })} label="Product certificates" />
            <span><span className="block text-[0.88rem] font-medium text-ink">Product certificates</span>
              <span className="text-[0.78rem] text-ink-faint">A lab report, FSSAI or ISI certificate link per stock item, who certified it and until when. Labels print a QR to it; Insights warns before one runs out.</span></span>
          </label>
          <label className="flex items-start gap-3">
            <Toggle on={!!feat.nutrition} onChange={(v) => set({ features: { ...feat, nutrition: v } })} label="Nutrition labels" />
            <span><span className="block text-[0.88rem] font-medium text-ink">Nutrition labels</span>
              <span className="text-[0.78rem] text-ink-faint">Ingredients, nutrition per serving, veg mark, allergens, how to use and FSSAI number per stock item, printed as pack labels from Barcode labels.</span></span>
          </label>
          <p className="text-[0.74rem] text-ink-faint">Switching a feature off hides its fields; what you entered stays and comes back when you switch it on again.</p>
        </div>
      </Section>
    </div>
  );
}
