"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Rocket, Trash2 } from "lucide-react";
import { COUNTRIES, DEFAULT_PROFILE, GOALS, INDUSTRIES, industryById, recommend, type Answers } from "@/lib/catalog";
import type { BusinessConfig, Lang } from "@/lib/model";
import { LANGS } from "@/lib/i18n";
import { themeCss } from "@/lib/theme";
import { todayIso } from "@/lib/metrics";
import { completeOnboarding, type Invite } from "@/app/actions";
import { ModulesEditor } from "@/components/config/modules";
import { KpiEditor } from "@/components/config/kpis";
import { IntelligenceEditor } from "@/components/config/intelligence";
import { AiRolesEditor } from "@/components/config/ai-roles";
import { RolesMatrix } from "@/components/config/team";
import { ThemeEditor } from "@/components/config/theme";
import { describeTrigger } from "@/components/config/automations";
import { Icon } from "@/components/icon";
import { Chip, Label, Segmented, Toggle, btnGhost, btnPrimary, btnQuiet, control } from "@/components/ui";

type Config = Omit<BusinessConfig, "name">;
type Extra = { gstin: string; upiId: string; cash: string; language: Lang };
type Draft = { step: number; name: string; answers: Answers; config: Config | null; basis: string; invites: Invite[]; extra?: Extra; sample?: boolean };

const STEPS = [
  { title: "Your business", sub: "The basics: where you are and how big." },
  { title: "Industry", sub: "So we start from what businesses like yours need." },
  { title: "How you work", sub: "A few yes/no questions that shape everything after." },
  { title: "Modules", sub: "The registers you'll record in. Switch, rename, reshape." },
  { title: "KPIs", sub: "The numbers you want to run the business by." },
  { title: "Forecasts & analytics", sub: "What to predict, how far, and how to slice it." },
  { title: "AI team", sub: "Your AI leadership and the automations they start with." },
  { title: "Team & access", sub: "Who else signs in, and what each role can open." },
  { title: "Look & feel", sub: "Make the workspace yours." },
  { title: "Review & launch", sub: "Everything in one place before we build it." },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SIZES = ["Just me", "2–10", "11–50", "51–200", "200+"];
// one draft per business, so a second account set up in the same browser starts clean
const draftKey = (businessId: string) => `retailx:onboarding:v2:${businessId}`;
const gstinOk = (g: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g.trim().toUpperCase());

const genPassword = () => Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6) + "-" + Math.floor(Math.random() * 90 + 10);

export function Wizard({ businessId, businessName, ownerName }: { businessId: string; businessName: string; ownerName: string }) {
  const KEY = draftKey(businessId);
  const [d, setD] = useState<Draft>(() => ({
    step: 0, name: businessName, config: null, basis: "", invites: [],
    answers: { industry: "", category: "", city: "", country: "India", currency: "INR", fiscalStart: 4, profile: { ...DEFAULT_PROFILE } },
  }));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // resume a half-finished setup after a refresh (this browser only); never save before the restore ran
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setD(JSON.parse(raw)); } catch { /* storage unavailable */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
  }, [d, restored]);

  const a = d.answers;
  const p = a.profile;
  const ind = a.industry ? industryById(a.industry) : null;
  const setA = (patch: Partial<Answers>) => setD((x) => ({ ...x, answers: { ...x.answers, ...patch } }));
  const setP = (patch: Partial<Answers["profile"]>) => setD((x) => ({ ...x, answers: { ...x.answers, profile: { ...x.answers.profile, ...patch } } }));
  const ex: Extra = d.extra ?? { gstin: "", upiId: "", cash: "", language: "en" };
  const setX = (patch: Partial<Extra>) => setD((x) => ({ ...x, extra: { ...(x.extra ?? { gstin: "", upiId: "", cash: "", language: "en" }), ...patch } }));
  const setC = (patch: Partial<Config>) => setD((x) => (x.config ? { ...x, config: { ...x.config, ...patch } } : x));

  const canNext = [
    d.name.trim().length > 1 && !!a.currency && (!ex.gstin || gstinOk(ex.gstin)),
    !!a.industry && !!a.category,
    true, true, true, true, true, true, true, true,
  ][d.step];

  const go = (to: number) => {
    setError("");
    setD((x) => {
      const basis = JSON.stringify(x.answers);
      const rebuild = to >= 3 && (x.config == null || x.basis !== basis);
      return { ...x, step: to, config: rebuild ? recommend(x.answers) : x.config, basis: rebuild ? basis : x.basis };
    });
    window.scrollTo({ top: 0 });
  };

  const launch = () =>
    start(async () => {
      if (!d.config) return;
      const x = d.extra;
      const gstin = x?.gstin.trim().toUpperCase();
      const res = await completeOnboarding({
        ...d.config, name: d.name.trim(), language: x?.language ?? "en",
        ...(gstin ? { gstin, state: gstin.slice(0, 2) } : {}),
        ...(x?.upiId.trim() ? { upiId: x.upiId.trim() } : {}),
        ...(x?.cash.trim() ? { cash: { balance: Number(x.cash.replace(/[^0-9.-]/g, "")) || 0, asOf: todayIso() } } : {}),
      }, d.invites.filter((i) => i.name.trim() && (i.email || i.phone || i.username)), !!d.sample);
      if (res?.error) setError(res.error);
      else try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    });

  const step = STEPS[d.step];
  const c = d.config;
  const rebuilt = d.step >= 3 && c && d.basis === JSON.stringify(a);

  return (
    <div className="min-h-screen bg-paper">
      {/* the chosen theme applies to the wizard itself, so every step previews the final look */}
      {c ? <style>{themeCss(c.theme)}</style> : null}
      <header className="border-b border-rule">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-5">
          <span className="text-[1.05rem] font-bold tracking-[-0.03em] text-ink">Retail<span className="text-accent">X</span></span>
          <span className="text-[0.78rem] text-ink-soft">Setting up <span className="font-medium text-ink">{d.name || "your business"}</span> · step {d.step + 1} of {STEPS.length}</span>
        </div>
        <div className="h-0.5 bg-rule"><div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${((d.step + 1) / STEPS.length) * 100}%` }} /></div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-8 lg:grid-cols-[13rem_minmax(0,1fr)_17rem]">
        <nav aria-label="Setup steps" className="hidden lg:block">
          <ol className="space-y-0.5">
            {STEPS.map((s, i) => {
              const blocked = (i > 0 && d.name.trim().length < 2) || (i > 1 && (!a.industry || !a.category));
              return (
                <li key={s.title}>
                  <button type="button" disabled={blocked} onClick={() => go(i)}
                    className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[0.8rem] transition-colors disabled:opacity-40 ${i === d.step ? "bg-accent-wash font-medium text-accent" : "text-ink-soft hover:bg-panel"}`}>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-semibold ${i < d.step ? "bg-accent text-white" : i === d.step ? "border border-accent" : "border border-rule-strong"}`}>
                      {i < d.step ? <Check className="size-3" /> : i + 1}
                    </span>
                    {s.title}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="min-w-0">
          <h1 className="text-[1.6rem] font-semibold tracking-[-0.025em] text-ink">{d.step === 0 ? `Welcome, ${ownerName.split(" ")[0]}.` : step.title}</h1>
          <p className="mt-1 text-[0.9rem] text-ink-soft">{d.step === 0 ? "Let's build a workspace around your business. It takes about five minutes, and you can change everything later in Settings." : step.sub}</p>
          {rebuilt && d.step === 3 ? (
            <p className="mt-3 rounded-sm border border-accent/30 bg-accent-wash px-3 py-2 text-[0.8rem] text-accent">
              Built for a {ind?.name.toLowerCase()} ({a.category.toLowerCase()}) that {p.stock ? "keeps stock" : "doesn't keep stock"}{p.credit ? ", sells on credit" : ""}{p.locations > 1 ? `, across ${p.locations} locations` : ""}. Adjust anything.
            </p>
          ) : null}

          <div key={d.step} className="rx-rise mt-7">
            {d.step === 0 && (
              <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label text="Business name"><input className={control} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Label></div>
                <Label text="Country">
                  <select className={control} value={a.country} onChange={(e) => setA({ country: e.target.value, currency: COUNTRIES.find((x) => x.name === e.target.value)?.currency ?? a.currency })}>
                    {COUNTRIES.map((x) => <option key={x.name}>{x.name}</option>)}
                  </select>
                </Label>
                <Label text="City / town"><input className={control} value={a.city} onChange={(e) => setA({ city: e.target.value })} placeholder="e.g. Pune" /></Label>
                <Label text="Currency" hint="Amounts are recorded and reported in this currency.">
                  <select className={control} value={a.currency} onChange={(e) => setA({ currency: e.target.value })}>
                    {[...new Set(["INR", "USD", "AED", "SGD", "GBP", "EUR", "NPR", "LKR", "BDT", "KES", a.currency])].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Label>
                <Label text="Financial year starts in">
                  <select className={control} value={a.fiscalStart} onChange={(e) => setA({ fiscalStart: +e.target.value })}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </Label>
                <div className="sm:col-span-2">
                  <Label text="How many people work here?"><Segmented label="Team size" value={p.size} options={SIZES.map((s) => ({ value: s, label: s }))} onChange={(v) => setP({ size: v, payroll: v !== "Just me" })} /></Label>
                </div>
                <div className="sm:col-span-2">
                  <Label text="Locations / branches" hint={p.locations > 1 ? "We'll add a Location field to every register and break reports down by it." : undefined}>
                    <div className="flex items-center gap-3">
                      <input type="range" min={1} max={12} value={p.locations} onChange={(e) => setP({ locations: +e.target.value })} className="w-56 accent-[var(--color-accent)]" />
                      <span className="text-[0.9rem] font-semibold tabular-nums text-ink">{p.locations}{p.locations === 12 ? "+" : ""}</span>
                    </div>
                  </Label>
                </div>
                <Label text="GSTIN (optional)" hint={gstinOk(ex.gstin) ? "Used on tax invoices and GST summaries." : "15 characters, e.g. 27ABCDE1234F1Z5"}>
                  <input className={`${control} uppercase`} maxLength={15} value={ex.gstin} onChange={(e) => setX({ gstin: e.target.value })} placeholder="27ABCDE1234F1Z5" />
                </Label>
                <Label text="UPI ID (optional)" hint="Customers pay unpaid bills through a UPI link or QR.">
                  <input className={control} value={ex.upiId} onChange={(e) => setX({ upiId: e.target.value })} placeholder="yourshop@okicici" />
                </Label>
                <Label text="Cash in bank today (optional)" hint="Starts your cash-flow forecast.">
                  <input className={control} inputMode="decimal" value={ex.cash} onChange={(e) => setX({ cash: e.target.value.replace(/[^0-9.-]/g, "") })} placeholder="250000" />
                </Label>
                <Label text="Language for your team">
                  <select className={control} value={ex.language} onChange={(e) => setX({ language: e.target.value as Lang })}>
                    {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </Label>
              </div>
            )}

            {d.step === 1 && (
              <div className="space-y-8">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {INDUSTRIES.map((i) => (
                    <button key={i.id} type="button" aria-pressed={a.industry === i.id}
                      onClick={() => setA({ industry: i.id, category: i.categories.length === 1 ? i.categories[0].name : i.id === a.industry ? a.category : "" })}
                      className={`flex items-start gap-3 rounded-sm border p-3 text-left transition-colors ${a.industry === i.id ? "border-accent bg-accent-wash" : "border-rule hover:border-ink-faint"}`}>
                      <span className={`grid size-9 shrink-0 place-items-center rounded-sm ${a.industry === i.id ? "bg-accent text-white" : "bg-panel text-ink-soft"}`}><Icon name={i.icon} /></span>
                      <span>
                        <span className={`block text-[0.88rem] font-medium ${a.industry === i.id ? "text-accent" : "text-ink"}`}>{i.name}</span>
                        <span className="block text-[0.75rem] text-ink-faint">{i.blurb}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {ind && ind.categories.length > 1 ? (
                  <div>
                    <p className="text-[0.92rem] font-medium text-ink">What kind of {ind.name.toLowerCase()}?</p>
                    <p className="text-[0.78rem] text-ink-faint">Categories add the right fields, e.g. expiry dates for pharmacies, sizes for apparel.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ind.categories.map((cat) => <Chip key={cat.name} on={a.category === cat.name} onClick={() => setA({ category: cat.name })}>{cat.name}</Chip>)}
                      <AddChip label="Other…" onAdd={(v) => setA({ category: v })} />
                      {a.category && !ind.categories.some((x) => x.name === a.category) ? <Chip on onClick={() => setA({ category: "" })}>{a.category}</Chip> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {d.step === 2 && (
              <div className="max-w-2xl space-y-7">
                <Label text="What do you sell?">
                  <Segmented label="Sells" value={p.sells} options={[{ value: "products", label: "Products" }, { value: "services", label: "Services" }, { value: "both", label: "Both" }]}
                    onChange={(v) => setP({ sells: v, stock: v !== "services" })} />
                </Label>
                {([
                  ["stock", "Do you keep stock or materials?", "Adds Stock and Purchases, reorder alerts, and stock KPIs."],
                  ["credit", "Do customers ever pay later?", "Tracks unpaid bills and has your CFO chase them."],
                  ["payroll", "Do you pay salaries?", "Adds Team and Payroll, people KPIs and a Head of People."],
                ] as const).map(([k, q, hint]) => (
                  <div key={k} className="flex items-start justify-between gap-6 border-b border-rule pb-4">
                    <span><span className="block text-[0.9rem] font-medium text-ink">{q}</span><span className="text-[0.78rem] text-ink-faint">{hint}</span></span>
                    <Toggle on={p[k]} onChange={(v) => setP({ [k]: v })} label={q} />
                  </div>
                ))}
                <div>
                  <p className="text-[0.9rem] font-medium text-ink">How do you sell?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[...new Set([...(ind?.channels ?? []), ...p.channels])].map((ch) => (
                      <Chip key={ch} on={p.channels.includes(ch)} onClick={() => setP({ channels: p.channels.includes(ch) ? p.channels.filter((x) => x !== ch) : [...p.channels, ch] })}>{ch}</Chip>
                    ))}
                    <AddChip label="+ Add" onAdd={(v) => setP({ channels: [...p.channels, v] })} />
                  </div>
                </div>
                <div>
                  <p className="text-[0.9rem] font-medium text-ink">What matters most this year?</p>
                  <p className="text-[0.78rem] text-ink-faint">Pick up to four. We prioritise KPIs, alerts and AI coaching around them.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {GOALS.map((g) => (
                      <Chip key={g} on={p.goals.includes(g)}
                        onClick={() => setP({ goals: p.goals.includes(g) ? p.goals.filter((x) => x !== g) : p.goals.length < 4 ? [...p.goals, g] : p.goals })}>{g}</Chip>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {c && d.step === 3 && <ModulesEditor modules={c.modules} recommended={ind?.modules} onChange={(modules) => setC({ modules })} />}
            {c && d.step === 4 && <KpiEditor kpis={c.kpis} modules={c.modules} onChange={(kpis) => setC({ kpis })} />}
            {c && d.step === 5 && <IntelligenceEditor forecasts={c.forecasts} analytics={c.analytics} kpis={c.kpis} modules={c.modules} onChange={(x) => setC(x)} />}
            {c && d.step === 6 && (
              <div className="space-y-10">
                <AiRolesEditor roles={c.aiRoles} kpis={c.kpis} onChange={(aiRoles) => setC({ aiRoles })} />
                <section>
                  <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Starter automations</h3>
                  <p className="mt-1 text-[0.78rem] text-ink-soft">Switch on the ones you want. Build more, or edit these, under Automations.</p>
                  <ul className="mt-3 divide-y divide-rule border-y border-rule">
                    {c.automations.map((au, i) => (
                      <li key={au.id} className="flex items-center gap-3 py-2.5">
                        <Toggle on={au.enabled} onChange={(v) => setC({ automations: c.automations.map((x, j) => (j === i ? { ...x, enabled: v } : x)) })} label={au.name} />
                        <span className="min-w-0">
                          <span className="block text-[0.86rem] font-medium text-ink">{au.name}</span>
                          <span className="block truncate text-[0.74rem] text-ink-faint">
                            {describeTrigger(au.trigger, c.modules, c.kpis)} → {au.actions.map((x) => (x.type === "task" ? `task${x.assignee?.startsWith("ai:") ? ` for ${c.aiRoles.find((r) => `ai:${r.id}` === x.assignee)?.title ?? "AI"}` : ""}` : x.type === "notify" ? "notify" : "set field")).join(", ")}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
            {c && d.step === 7 && (
              <div className="space-y-10">
                <section>
                  <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Invite your team</h3>
                  <p className="mt-1 text-[0.78rem] text-ink-soft">Each email, phone or username belongs to one person and one role, so they never pick a role at sign-in. Share temporary passwords privately.</p>
                  <div className="mt-3 space-y-2">
                    {d.invites.map((inv, i) => {
                      const ident = inv.email ?? inv.phone ?? inv.username ?? "";
                      const setI = (patch: Partial<Invite>) => setD({ ...d, invites: d.invites.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                      return (
                        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_9rem_9rem_auto]">
                          <input aria-label="Name" className={control} placeholder="Name" value={inv.name} onChange={(e) => setI({ name: e.target.value })} />
                          <input aria-label="Email, phone or username" className={control} placeholder="Email, phone or username" value={ident}
                            onChange={(e) => { const v = e.target.value; setI(v.includes("@") ? { email: v, phone: undefined, username: undefined } : /^[+\d\s()-]{7,}$/.test(v) ? { phone: v, email: undefined, username: undefined } : { username: v, email: undefined, phone: undefined }); }} />
                          <select aria-label="Role" className={control} value={inv.roleId} onChange={(e) => setI({ roleId: e.target.value })}>
                            {c.roles.filter((r) => r.id !== "owner").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          <input aria-label="Temporary password" className={`${control} font-mono`} value={inv.password} onChange={(e) => setI({ password: e.target.value })} />
                          <button type="button" className={btnQuiet} aria-label="Remove invite" onClick={() => setD({ ...d, invites: d.invites.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></button>
                        </div>
                      );
                    })}
                    <button type="button" className={btnGhost} onClick={() => setD({ ...d, invites: [...d.invites, { name: "", roleId: c.roles.find((r) => r.id !== "owner")?.id ?? "staff", password: genPassword() }] })}>
                      <Plus className="size-3.5" /> Add a person
                    </button>
                  </div>
                </section>
                <section>
                  <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Roles and what they can open</h3>
                  <div className="mt-3"><RolesMatrix roles={c.roles} modules={c.modules} onChange={(roles) => setC({ roles })} /></div>
                </section>
              </div>
            )}
            {c && d.step === 8 && <ThemeEditor theme={c.theme} onChange={(theme) => setC({ theme })} preview={false} />}
            {c && d.step === 9 && (
              <>
                <Review name={d.name} answers={a} c={c} invites={d.invites.length} onEdit={go} />
                <div className="mt-6 grid gap-3 rounded-sm border border-rule p-4">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Product features <span className="font-normal normal-case tracking-normal text-ink-faint">· optional, change any time in Settings → Counter &amp; invoices</span></p>
                  <label className="flex items-start gap-3">
                    <Toggle on={!!c.features?.certificates} onChange={(v) => setC({ features: { ...c.features, certificates: v } })} label="Product certificates" />
                    <span><span className="block text-[0.88rem] font-medium text-ink">Product certificates</span>
                      <span className="text-[0.78rem] text-ink-faint">Lab report, FSSAI or ISI certificate per product, with a QR on labels and a warning before it runs out.</span></span>
                  </label>
                  <label className="flex items-start gap-3">
                    <Toggle on={!!c.features?.nutrition} onChange={(v) => setC({ features: { ...c.features, nutrition: v } })} label="Nutrition labels" />
                    <span><span className="block text-[0.88rem] font-medium text-ink">Nutrition labels</span>
                      <span className="text-[0.78rem] text-ink-faint">Ingredients, nutrition per serving, veg mark and allergens per product, printed as pack labels. For food, supplements and pharmacies.</span></span>
                  </label>
                </div>
                <label className="mt-4 flex items-start gap-3 rounded-sm border border-rule p-4">
                  <Toggle on={!!d.sample} onChange={(v) => setD({ ...d, sample: v })} label="Start with sample data" />
                  <span>
                    <span className="block text-[0.88rem] font-medium text-ink">Start with sample data</span>
                    <span className="text-[0.78rem] text-ink-faint">Six months of realistic records in your modules, so every chart, forecast and AI briefing has something to show. Remove it in one click from the dashboard when you&apos;re ready.</span>
                  </span>
                </label>
              </>
            )}
          </div>

          {error ? <p role="alert" className="mt-6 rounded-sm border border-bad/25 bg-bad-wash px-3 py-2 text-[0.82rem] text-bad">{error}</p> : null}

          <div className="mt-10 flex items-center justify-between border-t border-rule pt-5">
            <button type="button" className={btnQuiet} disabled={d.step === 0} onClick={() => go(d.step - 1)}><ArrowLeft className="size-3.5" /> Back</button>
            {d.step < STEPS.length - 1 ? (
              <button type="button" className={btnPrimary} disabled={!canNext} onClick={() => go(d.step + 1)}>
                {d.step === 2 ? "Build my workspace" : "Continue"} <ArrowRight className="size-3.5" />
              </button>
            ) : (
              <button type="button" className={`${btnPrimary} px-5 py-2`} disabled={pending} onClick={launch}>
                <Rocket className="size-4" /> {pending ? "Building your workspace…" : "Launch workspace"}
              </button>
            )}
          </div>
        </main>

        <Preview name={d.name} answers={a} c={c} />
      </div>
    </div>
  );
}


/** A chip that turns into a small text box for a custom value. */
function AddChip({ label, onAdd }: { label: string; onAdd: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  if (!editing) return <Chip on={false} onClick={() => setEditing(true)}>{label}</Chip>;
  const commit = () => { if (v.trim()) onAdd(v.trim()); setV(""); setEditing(false); };
  return (
    <input autoFocus aria-label={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") setEditing(false); }}
      className="w-40 rounded-full border border-accent bg-surface px-3 py-1 text-[0.78rem] text-ink outline-none" />
  );
}

function Preview({ name, answers, c }: { name: string; answers: Answers; c: Config | null }) {
  const ind = answers.industry ? industryById(answers.industry) : null;
  const groups = useMemo(() => {
    const on = c?.modules.filter((m) => m.enabled) ?? [];
    return [...new Set(on.map((m) => m.group))].map((g) => ({ g, items: on.filter((m) => m.group === g) }));
  }, [c]);
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 rounded-md border border-rule bg-panel/60 p-4">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Your workspace</p>
        <p className="mt-2 text-[0.95rem] font-semibold text-ink">{name || "Your business"}</p>
        <p className="text-[0.75rem] text-ink-soft">{ind ? `${ind.name}${answers.category ? ` · ${answers.category}` : ""}` : "Pick an industry"}{answers.city ? ` · ${answers.city}` : ""}</p>
        {c ? (
          <>
            <div className="mt-4 space-y-3">
              {groups.map(({ g, items }) => (
                <div key={g}>
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">{g}</p>
                  <ul className="mt-1 space-y-0.5">
                    {items.map((m) => <li key={m.id} className="flex items-center gap-2 text-[0.78rem] text-ink-soft"><Icon name={m.icon} className="size-3.5 text-ink-faint" />{m.name}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-rule pt-3 text-[0.75rem] text-ink-soft">
              <p><span className="font-semibold text-ink">{c.kpis.length}</span> KPIs · <span className="font-semibold text-ink">{c.forecasts.length}</span> forecasts · <span className="font-semibold text-ink">{c.automations.filter((x) => x.enabled).length}</span> automations</p>
              <div className="mt-3 flex -space-x-1.5">
                {c.aiRoles.filter((r) => r.enabled).map((r) => (
                  <span key={r.id} title={r.title} className="grid size-7 place-items-center rounded-full border-2 border-panel bg-accent-wash text-accent"><Icon name={r.icon} className="size-3.5" /></span>
                ))}
              </div>
              <p className="mt-1">{c.aiRoles.filter((r) => r.enabled).map((r) => r.title.replace("Chief ", "").replace(" Officer", "")).join(", ")}</p>
            </div>
          </>
        ) : (
          <p className="mt-4 text-[0.78rem] leading-relaxed text-ink-faint">Your modules, KPIs and AI team appear here as you answer.</p>
        )}
      </div>
    </aside>
  );
}

function Review({ name, answers, c, invites, onEdit }: { name: string; answers: Answers; c: Config; invites: number; onEdit: (s: number) => void }) {
  const rows: { k: string; v: string; step: number }[] = [
    { k: "Business", v: `${name} · ${answers.city || "—"}, ${answers.country} · ${answers.currency} · FY from ${MONTHS[answers.fiscalStart - 1]}`, step: 0 },
    { k: "Industry", v: `${industryById(answers.industry).name} · ${answers.category}`, step: 1 },
    { k: "How you work", v: [answers.profile.sells, answers.profile.stock && "keeps stock", answers.profile.credit && "sells on credit", answers.profile.payroll && "pays salaries", `${answers.profile.locations} location(s)`].filter(Boolean).join(" · "), step: 2 },
    { k: "Modules", v: c.modules.filter((m) => m.enabled).map((m) => m.name).join(", "), step: 3 },
    { k: "KPIs", v: c.kpis.map((k) => k.name + (k.target != null ? ` (target ${k.target})` : "")).join(", ") || "None", step: 4 },
    { k: "Forecasts", v: c.forecasts.map((f) => `${f.name}, ${f.horizon} ${f.grain}s ahead`).join("; ") || "None", step: 5 },
    { k: "AI team", v: c.aiRoles.filter((r) => r.enabled).map((r) => `${r.title} (${r.autonomy})`).join(", ") || "None", step: 6 },
    { k: "Automations", v: `${c.automations.filter((x) => x.enabled).length} on`, step: 6 },
    { k: "Team", v: `${invites} invite(s) · ${c.roles.length} roles`, step: 7 },
    { k: "Look", v: `${c.theme.mode} · ${c.theme.density} · ${c.theme.font} · sidebar ${c.theme.sidebar}`, step: 8 },
  ];
  return (
    <dl className="divide-y divide-rule border-y border-rule">
      {rows.map((r) => (
        <div key={r.k} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr_auto] sm:gap-4">
          <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">{r.k}</dt>
          <dd className="text-[0.84rem] text-ink">{r.v}</dd>
          <button type="button" className="justify-self-start text-[0.78rem] text-accent hover:underline" onClick={() => onEdit(r.step)}>Edit</button>
        </div>
      ))}
    </dl>
  );
}
