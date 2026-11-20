import { t } from "@/lib/i18n";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/session";
import { describeTriggerText } from "@/lib/catalog";
import { Empty, PageHeader, Section } from "@/components/ui";
import { ApproveButtons } from "@/components/ApproveButtons";

export default async function ApprovalsPage() {
  const { lang, business: b, can } = await getCtx({ records: false });
  if (!can("tasks") && !can("automations")) redirect("/dashboard?denied=approvals");
  const role = (src: string) => b.aiRoles.find((r) => `ai:${r.id}` === src)?.title ?? "AI role";
  const tasks = can("tasks") ? b.tasks.filter((t) => t.needsApproval) : [];
  const autos = can("automations") ? b.automations.filter((a) => !a.enabled && a.createdBy.startsWith("ai:")) : [];
  return (
    <>
      <PageHeader title={t(lang, "nav.approvals")} meta="What your AI team drafted on “draft” autonomy. Approve to let it happen, or reject to drop it." />
      {!tasks.length && !autos.length ? (
        <div className="mt-8"><Empty title="Nothing waiting">When an AI role on draft autonomy proposes a task or an automation, it lands here.</Empty></div>
      ) : null}
      {tasks.length ? (
        <Section title="Proposed tasks" meta={`${tasks.length}`}>
          <ul className="divide-y divide-rule border-b border-rule">
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.88rem] font-medium text-ink">{t.title}</p>
                  {t.detail ? <p className="mt-0.5 text-[0.8rem] text-ink-soft">{t.detail}</p> : null}
                  <p className="mt-0.5 text-[0.72rem] text-ink-faint">Proposed by {role(t.source)}{t.assignee ? ` for ${t.assignee.startsWith("ai:") ? role(t.assignee) : "a team member"}` : ""}{t.due ? ` · due ${t.due}` : ""}</p>
                </div>
                <ApproveButtons id={t.id} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {autos.length ? (
        <Section title="Drafted automations" meta={`${autos.length}`}>
          <ul className="divide-y divide-rule border-b border-rule">
            {autos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.88rem] font-medium text-ink">{a.name}</p>
                  <p className="mt-0.5 text-[0.8rem] text-ink-soft">{describeTriggerText(a, b)}</p>
                  <p className="mt-0.5 text-[0.72rem] text-ink-faint">Drafted by {role(a.createdBy)}</p>
                </div>
                <ApproveButtons id={a.id} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
