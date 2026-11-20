import { t } from "@/lib/i18n";
import { requireArea } from "@/lib/session";
import { listUsers } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { TaskBoard } from "@/components/TaskBoard";

export default async function TasksPage() {
  const { lang, business: b, user, can } = await requireArea("tasks");
  return (
    <>
      <PageHeader title={t(lang, "nav.tasks")} meta="Work for people and for your AI team. Automations and AI roles add tasks here too." />
      <TaskBoard tasks={b.tasks} roles={b.aiRoles} members={await listUsers(b.id)} me={user.id} canAi={can("ai")} />
    </>
  );
}
