import { notFound } from "next/navigation";
import { requireArea } from "@/lib/session";
import { aiConfigured, briefing } from "@/lib/ai";
import { RoleChat } from "@/components/RoleChat";

const STARTERS: Record<string, string[]> = {
  gm: ["What should we focus on this week?", "Run a weekly business review", "Which tasks are overdue and who owns them?"],
  cfo: ["How healthy is our cash and margin?", "Who owes us the most?", "Where can we cut costs without hurting sales?"],
  coo: ["What needs reordering?", "Where are we wasting time or stock?", "Set up an automation for low stock"],
  cto: ["Where is our data incomplete?", "What should we automate first?", "Which tools would pay for themselves?"],
  hr: ["Is our payroll cost healthy for our revenue?", "Do we need to hire?", "What compliance dates are coming up?"],
  cmo: ["How do we win more customers this month?", "Plan a low-budget campaign for this month", "Which customers should we win back?"],
};

export default async function RolePage({ params }: PageProps<"/ai/[role]">) {
  const { role: id } = await params;
  const { business: b } = await requireArea("ai");
  const role = b.aiRoles.find((r) => r.id === id && r.enabled);
  if (!role) notFound();
  return (
    <RoleChat
      role={role}
      thread={b.threads[role.id] ?? []}
      tasks={b.tasks.filter((t) => t.assignee === `ai:${role.id}`).slice(0, 20)}
      starters={STARTERS[role.id] ?? role.responsibilities.slice(0, 3).map((r) => `Help me with: ${r}`)}
      briefing={briefing(b, role)}
      live={aiConfigured()}
    />
  );
}
