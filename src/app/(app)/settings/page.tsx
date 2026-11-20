import { t } from "@/lib/i18n";
import { requireArea } from "@/lib/session";
import { listAudit, listUsers } from "@/lib/db";
import type { BusinessConfig } from "@/lib/model";
import { PageHeader } from "@/components/ui";
import { SettingsPanel } from "@/components/SettingsPanel";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { lang, business: b, user, role } = await requireArea("settings");
  const { tab } = await searchParams;
  const config: BusinessConfig = {
    name: b.name, industry: b.industry, category: b.category, city: b.city, country: b.country, currency: b.currency, locale: b.locale,
    fiscalStart: b.fiscalStart, profile: b.profile, modules: b.modules, kpis: b.kpis, forecasts: b.forecasts, analytics: b.analytics,
    aiRoles: b.aiRoles, automations: b.automations, dashboard: b.dashboard, theme: b.theme, roles: b.roles,
    gstin: b.gstin, state: b.state, upiId: b.upiId, cash: b.cash, events: b.events ?? [], language: b.language,
    // the PIN's hash never leaves the server; the panel only needs to know one is set
    counter: { ...b.counter, pinHash: undefined }, features: b.features ?? {},
  };
  return (
    <>
      <PageHeader title={t(lang, "nav.settings")} meta="Everything you chose during setup, and more. Changes apply for your whole team." />
      <SettingsPanel
        config={config}
        members={await listUsers(b.id)}
        me={user.id}
        owner={role.id === "owner"}
        hasPin={!!b.counter?.pinHash}
        initialTab={typeof tab === "string" ? tab : "business"}
        audit={tab === "audit" ? await listAudit(b.id, { limit: 300 }) : []}
      />
    </>
  );
}
