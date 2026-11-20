import { t } from "@/lib/i18n";
import { requireArea } from "@/lib/session";
import { listUsers } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { AutomationsBoard } from "@/components/AutomationsBoard";

export default async function AutomationsPage() {
  const { lang, business: b } = await requireArea("automations");
  return (
    <>
      <PageHeader title={t(lang, "nav.automations")} meta="When something happens, do something. Record triggers fire on save; schedules and KPI watches run as the day goes on." />
      <AutomationsBoard
        automations={b.automations}
        activity={b.activity.filter((a) => a.kind === "automation" || a.kind === "ai").slice(0, 30)}
        modules={b.modules}
        kpis={b.kpis}
        roles={b.aiRoles}
        members={await listUsers(b.id)}
      />
    </>
  );
}
