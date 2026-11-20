import { t } from "@/lib/i18n";
import Link from "next/link";
import { requireArea } from "@/lib/session";
import { aiConfigured, roleKpis } from "@/lib/ai";
import { kpiStatus } from "@/lib/metrics";
import { Icon } from "@/components/icon";
import { AUTONOMY } from "@/lib/catalog";
import { Empty, PageHeader, btnGhost } from "@/components/ui";

export default async function AiTeamPage() {
  const { lang, business: b, can } = await requireArea("ai");
  const roles = b.aiRoles.filter((r) => r.enabled);
  return (
    <>
      <PageHeader
        title={t(lang, "nav.ai")}
        meta="Your AI leadership. Each one watches its part of the business, coaches you, and works on the tasks you give it."
        actions={can("settings") ? <Link href="/settings?tab=ai" className={btnGhost}>Hire or shape roles</Link> : undefined}
      />
      {!aiConfigured() ? (
        <p className="mt-5 rounded-sm border border-warn/30 bg-warn-wash px-3 py-2 text-[0.8rem] text-warn">
          Running on built-in rules: roles give KPI-based briefings but can&apos;t converse or act. Set <code>ANTHROPIC_API_KEY</code>, or a free Gemini key as <code>AI_API_KEY</code>, on the server to switch on full conversations and task work.
        </p>
      ) : null}
      {roles.length ? (
        <ul className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const watch = roleKpis(b, r).map((k) => kpiStatus(b, k, b.analytics.grain));
            const flagged = watch.filter((s) => s.status === "bad" || s.status === "watch").length;
            const open = b.tasks.filter((t) => t.assignee === `ai:${r.id}` && t.status !== "done").length;
            const last = b.threads[r.id]?.at(-1);
            return (
              <li key={r.id}>
                <Link href={`/ai/${r.id}`} className="group flex h-full flex-col rounded-sm border border-rule bg-surface p-5 transition-colors hover:border-accent/50">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-accent-wash text-accent"><Icon name={r.icon} className="size-5" /></span>
                    <span>
                      <span className="block text-[0.95rem] font-semibold text-ink group-hover:text-accent">{r.title}</span>
                      <span className="block text-[0.75rem] text-ink-faint">{r.name} · {AUTONOMY.find((a) => a.value === r.autonomy)?.label}</span>
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-[0.8rem] leading-relaxed text-ink-soft">{r.mandate}</p>
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-[0.75rem]">
                    <span className="text-ink-soft"><span className="font-semibold text-ink">{watch.length}</span> KPIs watched</span>
                    {flagged ? <span className="font-medium text-warn">{flagged} need attention</span> : <span className="text-good">on track</span>}
                    <span className="text-ink-soft"><span className="font-semibold text-ink">{open}</span> open tasks</span>
                  </div>
                  {last ? <p className="mt-2 truncate border-t border-rule pt-2 text-[0.74rem] text-ink-faint">{last.text.replace(/[*_]/g, "").slice(0, 120)}</p> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-8"><Empty title="No AI roles switched on">Turn on a CFO, COO, GM and others in Settings → AI team.</Empty></div>
      )}
    </>
  );
}
