import { requireArea } from "@/lib/session";
import { breakdown, complete, kpiSeries, kpiStatus, moneyField } from "@/lib/metrics";
import { runForecast, SEASON_BY_GRAIN } from "@/lib/forecast";
import { briefing } from "@/lib/ai";
import { kpiModules } from "@/lib/catalog";
import type { Business, Widget } from "@/lib/model";
import { Dashboard, type WidgetData } from "@/components/Dashboard";

function dataFor(b: Business, w: Widget): WidgetData {
  const kpi = b.kpis.find((k) => k.id === w.kpi);
  const g = b.analytics.grain;
  switch (w.type) {
    case "kpi":
      return kpi ? { kind: "kpi", status: kpiStatus(b, kpi, g, b.analytics.compareTo) } : { kind: "none" };
    case "trend":
      return kpi ? { kind: "trend", unit: kpi.unit, points: complete(kpiSeries(b, kpi, g), g).slice(-24).map((p) => ({ x: p.label, actual: p.value })) } : { kind: "none" };
    case "forecast": {
      if (!kpi) return { kind: "none" };
      const def = b.forecasts.find((f) => f.kpi === kpi.id);
      const grain = def?.grain ?? "month";
      const s = complete(kpiSeries(b, kpi, grain), grain);
      const r = runForecast(s.map((p) => p.value ?? 0), {
        model: def?.model ?? "auto", season: def?.season ?? "auto", seasonCandidate: SEASON_BY_GRAIN[grain], horizon: def?.horizon ?? 6,
        confidence: def?.confidence ?? 90, transform: def?.transform ?? "none", selectBy: def?.selectBy ?? "smape",
      });
      if (!r) return { kind: "forecast", unit: kpi.unit, points: [], periods: s.length };
      const hist = s.slice(-18).map((p) => ({ x: p.label, actual: p.value }));
      const fut = r.forecast.map((v, i) => ({ x: `+${i + 1}`, predicted: v, lower: r.lower[i], upper: r.upper[i] }));
      return { kind: "forecast", unit: kpi.unit, points: [...hist, ...fut], periods: s.length, model: r.chosen, next: r.forecast[0] };
    }
    case "breakdown": {
      const mod = b.modules.find((m) => m.id === w.module);
      if (!mod || !w.field) return { kind: "none" };
      const measure = moneyField(mod);
      return { kind: "breakdown", money: !!measure, items: breakdown(b, mod.id, w.field, measure).slice(0, 8) };
    }
    case "records": {
      const mod = b.modules.find((m) => m.id === w.module);
      return mod ? { kind: "records", module: mod, rows: (b.records[mod.id] ?? []).slice(0, 8) } : { kind: "none" };
    }
    case "tasks":
      return { kind: "tasks", tasks: b.tasks.filter((t) => t.status !== "done").slice(0, 10) };
    case "ai": {
      const role = b.aiRoles.find((r) => r.id === w.role && r.enabled) ?? b.aiRoles.find((r) => r.enabled);
      return role ? { kind: "ai", role, text: briefing(b, role) } : { kind: "none" };
    }
    case "activity":
      return { kind: "activity", items: b.activity.slice(0, 12) };
    case "note":
      return { kind: "note" };
  }
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { business: b, can, user } = await requireArea("dashboard");
  const sp = await searchParams;
  // one layout for the business, but each viewer only gets tiles built from what their role can open
  const allowed = (w: Widget) => {
    const kpi = b.kpis.find((k) => k.id === w.kpi);
    if (w.type === "kpi" || w.type === "trend" || w.type === "forecast") return !kpi || kpiModules(kpi).every(can);
    if (w.type === "breakdown" || w.type === "records") return !w.module || can(w.module);
    if (w.type === "ai") return can("ai");
    if (w.type === "activity") return can("automations");
    if (w.type === "tasks") return can("tasks");
    return true;
  };
  const personal = !!user.prefs?.dashboard;
  const layout = user.prefs?.dashboard ?? b.dashboard;
  const widgets = can("settings") ? layout : layout.filter(allowed);
  const data = Object.fromEntries(widgets.map((w) => [w.id, dataFor(b, w)]));
  const empty = b.modules.filter((m) => m.enabled).every((m) => !(b.records[m.id]?.length));
  return (
    <Dashboard
      name={user.name.split(" ")[0]}
      personal={personal}
      sample={Object.values(b.records).some((rows) => rows.some((r) => r.sample))}
      widgets={widgets}
      data={data}
      canEdit={can("settings")}
      denied={typeof sp.denied === "string" ? sp.denied : undefined}
      empty={empty}
      catalog={{
        kpis: b.kpis.map((k) => ({ id: k.id, name: k.name })),
        modules: b.modules.filter((m) => m.enabled).map((m) => ({ id: m.id, name: m.name, fields: [...m.fields.filter((f) => f.type === "select"), ...m.fields.filter((f) => f.type === "text")].map((f) => ({ key: f.key, label: f.label })) })),
        roles: b.aiRoles.filter((r) => r.enabled).map((r) => ({ id: r.id, name: r.title })),
        firstModule: b.modules.find((m) => m.enabled)?.id,
      }}
      fmt={{ currency: b.currency, locale: b.locale }}
    />
  );
}
