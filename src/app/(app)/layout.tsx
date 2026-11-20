import { after } from "next/server";
import { getCtx } from "@/lib/session";
import { purgeDeleted, updateBusiness } from "@/lib/db";
import { deliver, runDue, type Outgoing } from "@/lib/automation";
import { dailyBriefings } from "@/lib/ai";
import { industryById } from "@/lib/catalog";
import { t } from "@/lib/i18n";
import { todayIso } from "@/lib/metrics";
import { themeCss } from "@/lib/theme";
import { AppShell, type NavItem, type Notice } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, business: b, role, can, lang } = await getCtx();
  const tr = (k: Parameters<typeof t>[1]) => t(lang, k);

  // Housekeeping after the response is sent, so pages never wait on it. /api/cron does the same on a clock;
  // this is the fallback for deployments without one.
  after(async () => {
    if (runDue(structuredClone(b)) > 0) {
      const out: Outgoing[] = [];
      await updateBusiness(b.id, (x) => runDue(x, out), { records: true });
      await deliver(b.id, out);
    }
    if (b.aiRoles.some((r) => r.enabled && b.briefed?.[r.id] !== todayIso())) await dailyBriefings(b.id);
    await purgeDeleted(b.id);
  });

  const approvals = b.tasks.filter((x) => x.needsApproval).length + b.automations.filter((a) => !a.enabled && a.createdBy.startsWith("ai:")).length;
  const nav: NavItem[] = [];
  const g = { overview: tr("group.overview"), intel: tr("group.intelligence"), auto: tr("group.automation"), ws: tr("group.workspace") };
  if (can("dashboard")) nav.push({ href: "/dashboard", label: tr("nav.dashboard"), icon: "dashboard", group: g.overview });
  const on = (id: string) => b.modules.some((m) => m.id === id && m.enabled);
  if (can("sales") && on("sales")) nav.push(
    { href: "/pos", label: tr("nav.pos"), icon: "pos", group: g.overview },
    { href: "/dayclose", label: tr("nav.dayclose"), icon: "dayclose", group: g.overview },
  );
  if (can("inventory") && on("inventory")) nav.push({ href: "/labels", label: tr("nav.labels"), icon: "labels", group: g.overview });
  for (const m of b.modules) if (m.enabled && can(m.id)) nav.push({ href: `/m/${m.id}`, label: m.name, icon: m.icon, group: m.group || tr("group.records") });
  if (can("analytics")) nav.push({ href: "/analytics", label: tr("nav.analytics"), icon: "analytics", group: g.intel });
  if (can("analytics")) nav.push({ href: "/insights", label: tr("nav.insights"), icon: "insights", group: g.intel });
  if (can("analytics")) nav.push({ href: "/market", label: tr("nav.market"), icon: "market", group: g.intel });
  if (can("forecasting")) nav.push({ href: "/forecasting", label: tr("nav.forecasting"), icon: "forecasting", group: g.intel });
  if (can("analytics") && b.profile.locations > 1) nav.push({ href: "/planner", label: tr("nav.planner"), icon: "planner", group: g.intel });
  if (can("reports")) nav.push({ href: "/reports", label: tr("nav.reports"), icon: "reports", group: g.intel });
  if (can("reports")) nav.push({ href: "/books", label: tr("nav.books"), icon: "books", group: g.intel });
  if (can("ai")) nav.push({ href: "/ai", label: tr("nav.ai"), icon: "ai", group: g.auto });
  if (can("tasks") || can("automations")) nav.push({ href: "/approvals", label: tr("nav.approvals"), icon: "approvals", group: g.auto, badge: approvals });
  if (can("automations")) nav.push({ href: "/automations", label: tr("nav.automations"), icon: "automations", group: g.auto });
  if (can("tasks")) {
    const mine = new Set([`user:${user.id}`, ...(role.id === "owner" ? [undefined] : [])]);
    nav.push({ href: "/tasks", label: tr("nav.tasks"), icon: "tasks", group: g.auto, badge: b.tasks.filter((x) => x.status !== "done" && !x.needsApproval && mine.has(x.assignee)).length });
  }
  if (can("settings")) nav.push({ href: "/settings", label: tr("nav.settings"), icon: "settings", group: g.ws });

  // notifications: work assigned to me, things waiting for my approval, and (for those who can see it) the activity feed
  const seen = user.prefs?.seenAt ?? "";
  const notices: Notice[] = [
    ...b.tasks.filter((x) => x.assignee === `user:${user.id}` && x.status !== "done").map((x) => ({ id: x.id, at: x.createdAt, text: `Task for you: ${x.title}`, href: "/tasks" })),
    ...(role.id === "owner" ? b.tasks.filter((x) => x.needsApproval).map((x) => ({ id: x.id, at: x.createdAt, text: `Needs approval: ${x.title}`, href: "/approvals" })) : []),
    ...(can("automations") ? b.activity.filter((a) => a.kind !== "info").map((a) => ({ id: a.id, at: a.at, text: a.text, href: a.link ?? (a.kind === "ai" ? "/ai" : "/automations") })) : []),
  ].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 30);

  return (
    <>
      <style>{themeCss(b.theme)}</style>
      <AppShell
        business={{ name: b.name, tagline: `${industryById(b.industry).name}${b.city ? ` · ${b.city}` : ""}` }}
        user={{ name: user.name, role: role.name, identifier: user.email ?? user.phone ?? user.username ?? "" }}
        nav={nav}
        side={b.theme.sidebar}
        lang={lang}
        notices={notices}
        unread={notices.filter((n) => n.at > seen).length}
        quickModules={b.modules.filter((m) => m.enabled && can(m.id)).map((m) => ({ id: m.id, name: m.name, icon: m.icon }))}
      >
        {children}
      </AppShell>
    </>
  );
}
