"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, GripVertical, Minus, Plus, Settings2, X } from "lucide-react";
import { removeSampleData, saveDashboard, savePersonalDashboard } from "@/app/actions";
import { useT } from "@/components/lang";
import { ago, dateShort, fmtUnit, type Fmt } from "@/lib/format";
import { MODELS } from "@/lib/forecast";
import type { KpiStatus } from "@/lib/metrics";
import { uid, type Activity, type AiRole, type ModuleDef, type RecordRow, type Task, type Unit, type Widget, type WidgetType } from "@/lib/model";
import { BarComposition, LineChart, Sparkline } from "@/components/charts";
import { Icon } from "@/components/icon";
import { Delta, PageHeader, Prose, StatusPill, btnGhost, btnPrimary, btnQuiet, control } from "@/components/ui";
import { orAlert } from "@/lib/result";

type Pt = { x: string; actual?: number | null; predicted?: number | null; lower?: number | null; upper?: number | null };
export type WidgetData =
  | { kind: "none" }
  | { kind: "kpi"; status: KpiStatus }
  | { kind: "trend"; unit: Unit; points: Pt[] }
  | { kind: "forecast"; unit: Unit; points: Pt[]; periods: number; model?: string; next?: number }
  | { kind: "breakdown"; money: boolean; items: { label: string; value: number }[] }
  | { kind: "records"; module: ModuleDef; rows: RecordRow[] }
  | { kind: "tasks"; tasks: Task[] }
  | { kind: "ai"; role: AiRole; text: string }
  | { kind: "activity"; items: Activity[] }
  | { kind: "note" };

type Catalog = {
  kpis: { id: string; name: string }[];
  modules: { id: string; name: string; fields: { key: string; label: string }[] }[];
  roles: { id: string; name: string }[];
  firstModule?: string;
};

const TYPES: { type: WidgetType; label: string; w: number; h: number }[] = [
  { type: "kpi", label: "KPI tile", w: 1, h: 1 }, { type: "trend", label: "KPI trend", w: 2, h: 2 }, { type: "forecast", label: "Forecast", w: 2, h: 2 },
  { type: "breakdown", label: "Breakdown", w: 2, h: 2 }, { type: "records", label: "Latest records", w: 2, h: 2 }, { type: "tasks", label: "Tasks", w: 1, h: 2 },
  { type: "ai", label: "AI briefing", w: 2, h: 2 }, { type: "activity", label: "Activity", w: 2, h: 2 }, { type: "note", label: "Note", w: 1, h: 1 },
];

export function Dashboard({ name, widgets, data, canEdit, personal, catalog, fmt, denied, empty, sample }: {
  name: string; widgets: Widget[]; data: Record<string, WidgetData>; canEdit: boolean; personal: boolean; catalog: Catalog; fmt: Fmt;
  denied?: string; empty: boolean; sample: boolean;
}) {
  const tr = useT();
  const hour = new Date().getHours();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Widget[]>(widgets);
  const [drag, setDrag] = useState<string | null>(null);
  const [config, setConfig] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = editing ? draft : widgets;

  const patch = (id: string, p: Partial<Widget>) => setDraft((d) => d.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const moveTo = (from: string, to: string) =>
    setDraft((d) => {
      const a = [...d];
      const i = a.findIndex((w) => w.id === from), j = a.findIndex((w) => w.id === to);
      if (i < 0 || j < 0) return d;
      const [x] = a.splice(i, 1);
      a.splice(j, 0, x);
      return a;
    });
  const add = (t: (typeof TYPES)[number]) => {
    const w: Widget = { id: uid("w_"), type: t.type, w: t.w, h: t.h, kpi: catalog.kpis[0]?.id, module: catalog.firstModule, field: catalog.modules.find((m) => m.id === catalog.firstModule)?.fields[0]?.key, role: catalog.roles[0]?.id, text: t.type === "note" ? "Write a note for your team" : undefined };
    setDraft((d) => [...d, w]);
    setConfig(w.id);
  };

  return (
    <>
      <PageHeader
        title={`${tr(hour < 12 ? "dash.morning" : hour < 17 ? "dash.afternoon" : "dash.evening")}, ${name}`}
        meta={<span suppressHydrationWarning>{tr("dash.sub")}{personal ? " · your own layout" : ""}</span>}
        actions={
          editing ? (
            <>
              <button className={btnQuiet} onClick={() => { setEditing(false); setDraft(widgets); setConfig(null); }}>{tr("rec.cancel")}</button>
              {canEdit ? (
                <button className={btnGhost} disabled={pending} onClick={() => start(async () => { await orAlert(saveDashboard(draft)); await orAlert(savePersonalDashboard(null)); setEditing(false); setConfig(null); })}>
                  {tr("dash.saveall")}
                </button>
              ) : null}
              <button className={btnPrimary} disabled={pending} onClick={() => start(async () => { await orAlert(savePersonalDashboard(draft)); setEditing(false); setConfig(null); })}>
                {pending ? "…" : tr("dash.savelayout")}
              </button>
            </>
          ) : (
            <>
              {personal ? <button className={btnQuiet} disabled={pending} onClick={() => start(async () => { await orAlert(savePersonalDashboard(null)); })}>{tr("dash.reset")}</button> : null}
              <button className={btnGhost} onClick={() => { setDraft(widgets); setEditing(true); }}><Settings2 className="size-3.5" /> {tr("dash.customise")}</button>
            </>
          )
        }
      />

      {denied ? <p className="mt-4 rounded-sm border border-warn/30 bg-warn-wash px-3 py-2 text-[0.8rem] text-warn">Your role can&apos;t open that page. Ask the owner to change your access in Settings.</p> : null}
      {empty && !editing ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-accent/30 bg-accent-wash px-4 py-3">
          <p className="text-[0.84rem] text-accent">{tr("dash.ready")}</p>
          {catalog.firstModule ? <Link href={`/m/${catalog.firstModule}`} className={btnPrimary}>{tr("dash.start")} <ArrowRight className="size-3.5" /></Link> : null}
        </div>
      ) : null}
      {sample && !editing ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-warn/30 bg-warn-wash px-4 py-3">
          <p className="text-[0.84rem] text-warn">{tr("dash.sample")}</p>
          {canEdit ? <button className={btnGhost} disabled={pending} onClick={() => confirm("Remove all sample records? Your own records stay.") && start(async () => { await orAlert(removeSampleData()); })}>{tr("dash.removesample")}</button> : null}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 border border-dashed border-accent/40 bg-accent-wash/40 p-3">
          <span className="mr-1 text-[0.76rem] font-medium text-accent">Drag tiles to reorder · resize with − + · add:</span>
          {TYPES.map((t) => <button key={t.type} className={btnGhost} onClick={() => add(t)}><Plus className="size-3" /> {t.label}</button>)}
        </div>
      ) : null}

      <div className="mt-6 grid auto-rows-[9.5rem] grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {list.map((w) => (
          <div
            key={w.id}
            draggable={editing}
            onDragStart={() => setDrag(w.id)}
            onDragOver={(e) => { if (editing && drag && drag !== w.id) { e.preventDefault(); moveTo(drag, w.id); } }}
            onDragEnd={() => setDrag(null)}
            style={{ "--w": w.w, "--wm": Math.min(w.w, 2), "--h": w.h } as React.CSSProperties}
            className={`relative flex min-w-0 flex-col overflow-hidden rounded-sm border bg-surface md:[grid-column:span_var(--wm)] lg:[grid-column:span_var(--w)] [grid-row:span_var(--h)] ${
              editing ? "cursor-grab border-dashed border-accent/50" : "border-rule"} ${drag === w.id ? "opacity-50" : ""}`}
          >
            {editing ? (
              <div className="flex items-center gap-1 border-b border-rule bg-panel/70 px-1.5 py-1 text-ink-soft">
                <GripVertical className="size-3.5 text-ink-faint" />
                <span className="flex-1 truncate text-[0.7rem] font-medium">{TYPES.find((t) => t.type === w.type)?.label}</span>
                <button className="rounded-sm p-0.5 hover:bg-surface" aria-label="Narrower" onClick={() => patch(w.id, { w: Math.max(1, w.w - 1) })}><Minus className="size-3" /></button>
                <span className="text-[0.66rem] tabular-nums">{w.w}×{w.h}</span>
                <button className="rounded-sm p-0.5 hover:bg-surface" aria-label="Wider" onClick={() => patch(w.id, { w: Math.min(4, w.w + 1) })}><Plus className="size-3" /></button>
                <button className="rounded-sm p-0.5 hover:bg-surface" aria-label="Taller" onClick={() => patch(w.id, { h: w.h === 3 ? 1 : w.h + 1 })}><span className="text-[0.66rem]">↕</span></button>
                <button className="rounded-sm p-0.5 hover:bg-surface" aria-label="Configure" onClick={() => setConfig(config === w.id ? null : w.id)}><Settings2 className="size-3" /></button>
                <button className="rounded-sm p-0.5 hover:bg-surface" aria-label="Remove" onClick={() => setDraft((d) => d.filter((x) => x.id !== w.id))}><X className="size-3" /></button>
              </div>
            ) : null}
            {editing && config === w.id ? (
              <WidgetConfig w={w} catalog={catalog} onChange={(p) => patch(w.id, p)} />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <WidgetBody w={w} d={data[w.id]} fmt={fmt} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function WidgetConfig({ w, catalog, onChange }: { w: Widget; catalog: Catalog; onChange: (p: Partial<Widget>) => void }) {
  const mod = catalog.modules.find((m) => m.id === w.module);
  return (
    <div className="space-y-2 overflow-auto p-3 text-[0.78rem]">
      {["kpi", "trend", "forecast"].includes(w.type) ? (
        <select aria-label="KPI" className={control} value={w.kpi ?? ""} onChange={(e) => onChange({ kpi: e.target.value })}>
          {catalog.kpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      ) : null}
      {["breakdown", "records"].includes(w.type) ? (
        <select aria-label="Module" className={control} value={w.module ?? ""} onChange={(e) => onChange({ module: e.target.value, field: catalog.modules.find((m) => m.id === e.target.value)?.fields[0]?.key })}>
          {catalog.modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      ) : null}
      {w.type === "breakdown" ? (
        <select aria-label="Group by" className={control} value={w.field ?? ""} onChange={(e) => onChange({ field: e.target.value })}>
          {mod?.fields.map((f) => <option key={f.key} value={f.key}>by {f.label}</option>)}
        </select>
      ) : null}
      {w.type === "ai" ? (
        <select aria-label="AI role" className={control} value={w.role ?? ""} onChange={(e) => onChange({ role: e.target.value })}>
          {catalog.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      ) : null}
      {w.type === "note" ? <textarea aria-label="Note" rows={3} className={control} value={w.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} /> : null}
      <p className="text-ink-faint">Save the layout to load new data.</p>
    </div>
  );
}

const H = ({ children, href }: { children: React.ReactNode; href?: string }) => (
  <div className="mb-2 flex items-baseline justify-between gap-2">
    <h3 className="truncate text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">{children}</h3>
    {href ? <Link href={href} className="shrink-0 text-[0.72rem] text-accent hover:underline">Open</Link> : null}
  </div>
);

function WidgetBody({ w, d, fmt }: { w: Widget; d?: WidgetData; fmt: Fmt }) {
  const tr = useT();
  if (w.type === "note") return <p className="whitespace-pre-wrap text-[0.86rem] leading-relaxed text-ink">{w.text}</p>;
  if (!d || d.kind === "none") return <p className="text-[0.8rem] text-ink-faint">Save the layout to load this tile.</p>;
  switch (d.kind) {
    case "kpi": {
      const s = d.status;
      return (
        <div className="flex h-full flex-col">
          <H>{s.kpi.name}</H>
          {s.partial ? <span className="-mt-1.5 mb-1 text-[0.66rem] text-ink-faint">{s.period}</span> : null}
          <span className="text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums">{fmtUnit(s.value, s.kpi.unit, fmt, true)}</span>
          <div className="mt-1.5 flex flex-wrap gap-x-3 text-[0.72rem]">
            {s.vsPrevious != null ? <Delta value={s.vsPrevious} suffix={s.kpi.unit === "pct" ? "pts" : "%"} higherIsBetter={s.kpi.higherIsBetter} label={tr(s.partial ? "dash.vssame" : "dash.vsprior")} /> : <span className="text-ink-faint">{s.period}</span>}
            {s.vsTarget != null ? <Delta value={s.vsTarget} suffix={s.kpi.unit === "pct" ? "pts" : "%"} higherIsBetter={s.kpi.higherIsBetter} label={tr("dash.vstarget")} /> : null}
          </div>
          {w.h > 1 || s.spark.length > 1 ? <div className="mt-auto pt-1"><Sparkline data={s.spark} tone={s.status === "bad" ? "bad" : "accent"} width={160} /></div> : null}
        </div>
      );
    }
    case "trend":
      return <><H href="/analytics">{tr("dash.trend")}</H><LineChart points={d.points} valueFormat={(n) => fmtUnit(n, d.unit, fmt, true)} height={w.h * 110} /></>;
    case "forecast":
      return (
        <>
          <H href="/forecasting">Forecast{d.model ? ` · ${MODELS.find((m) => m.key === d.model)?.name}` : ""}</H>
          {d.points.length ? (
            <>
              <p className="text-[0.8rem] text-ink-soft">{tr("dash.next")}: <span className="font-semibold text-ink">{fmtUnit(d.next ?? null, d.unit, fmt, true)}</span></p>
              <LineChart points={d.points} showBand showPredicted valueFormat={(n) => fmtUnit(n, d.unit, fmt, true)} height={w.h * 100} />
            </>
          ) : <p className="text-[0.8rem] text-ink-faint">Needs at least 4 periods of history; you have {d.periods}.</p>}
        </>
      );
    case "breakdown":
      return <><H href="/analytics">Breakdown</H>{d.items.length ? <BarComposition items={d.items} format={(n) => (d.money ? fmtUnit(n, "money", fmt, true) : String(n))} /> : <p className="text-[0.8rem] text-ink-faint">No records yet.</p>}</>;
    case "records":
      return (
        <>
          <H href={`/m/${d.module.id}`}>{d.module.name}</H>
          {d.rows.length ? (
            <ul className="divide-y divide-rule text-[0.78rem]">
              {d.rows.map((r) => {
                const f = d.module.fields;
                const title = f.find((x) => x.type === "text")?.key;
                const money = f.find((x) => x.type === "money")?.key;
                return (
                  <li key={r.id} className="flex justify-between gap-3 py-1.5">
                    <span className="truncate text-ink">{String(r.data[title ?? ""] ?? "—")}<span className="ml-2 text-ink-faint">{d.module.dateField && r.data[d.module.dateField] ? dateShort(String(r.data[d.module.dateField])) : ""}</span></span>
                    {money ? <span className="tabular-nums text-ink-soft">{fmtUnit(Number(r.data[money] ?? 0), "money", fmt, true)}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-[0.8rem] text-ink-faint">No records yet.</p>}
        </>
      );
    case "tasks":
      return (
        <>
          <H href="/tasks">{tr("dash.tasks")}</H>
          {d.tasks.length ? (
            <ul className="space-y-1.5 text-[0.78rem]">
              {d.tasks.map((t) => (
                <li key={t.id} className="flex gap-2">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${t.status === "doing" ? "bg-warn" : t.assignee?.startsWith("ai:") ? "bg-accent" : "bg-ink-faint"}`} />
                  <span className="text-ink">{t.title}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[0.8rem] text-ink-faint">Nothing open.</p>}
        </>
      );
    case "ai":
      return (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-accent-wash text-accent"><Icon name={d.role.icon} className="size-3.5" /></span>
            <span className="text-[0.8rem] font-medium text-ink">{d.role.name} · {d.role.title}</span>
            <Link href={`/ai/${d.role.id}`} className="ml-auto text-[0.72rem] text-accent hover:underline">Talk</Link>
          </div>
          <Prose text={d.text} />
        </>
      );
    case "activity":
      return (
        <>
          <H>{tr("dash.activity")}</H>
          {d.items.length ? (
            <ul className="space-y-1.5 text-[0.78rem]">
              {d.items.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span className="text-ink-soft">{a.kind === "ai" ? <StatusPill>AI</StatusPill> : null} {a.text}</span>
                  <span suppressHydrationWarning className="shrink-0 text-ink-faint">{ago(a.at)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[0.8rem] text-ink-faint">Nothing yet.</p>}
        </>
      );
  }
}
