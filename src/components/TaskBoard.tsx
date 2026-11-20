"use client";

import { useState, useTransition } from "react";
import { Bot, Play, Plus, Trash2 } from "lucide-react";
import { deleteTask, saveTask, workOnTask } from "@/app/actions";
import { ago, dateShort } from "@/lib/format";
import { todayIso } from "@/lib/metrics";
import { useT } from "@/components/lang";
import type { AiRole, PublicUser, Task } from "@/lib/model";
import { AssigneeSelect, assigneeLabel } from "@/components/config/automations";
import { Prose, Segmented, btnGhost, btnPrimary, btnQuiet, control } from "@/components/ui";
import { orAlert } from "@/lib/result";

const COLS: { status: Task["status"]; label: string }[] = [
  { status: "todo", label: "To do" }, { status: "doing", label: "In progress" }, { status: "done", label: "Done" },
];

export function TaskBoard({ tasks, roles, members, me, canAi }: { tasks: Task[]; roles: AiRole[]; members: PublicUser[]; me: string; canAi: boolean }) {
  const [filter, setFilter] = useState<"all" | "mine" | "ai">("all");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | undefined>();
  const [due, setDue] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const tr = useT();
  // proposals from AI roles live in Approvals until someone says yes
  const shown = tasks.filter((t) => !t.needsApproval && (filter === "all" || (filter === "mine" ? t.assignee === `user:${me}` || !t.assignee : t.assignee?.startsWith("ai:"))));
  const colLabel = { todo: tr("task.todo"), doing: tr("task.doing"), done: tr("task.done") };
  const move = (t: Task, status: Task["status"]) => start(async () => { await orAlert(saveTask({ ...t, status })); });

  return (
    <div>
      <form className="mt-6 flex flex-wrap items-end gap-2 border border-rule bg-panel/50 p-3"
        onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; start(async () => { await orAlert(saveTask({ title: title.trim(), assignee, due: due || undefined })); setTitle(""); setDue(""); }); }}>
        <input aria-label="New task" className={`${control} min-w-[16rem] flex-1`} placeholder={tr("task.new")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <AssigneeSelect value={assignee} roles={roles} members={members} onChange={setAssignee} />
        <input aria-label="Due date" type="date" className={`${control} w-auto`} value={due} onChange={(e) => setDue(e.target.value)} />
        <button className={btnPrimary} disabled={pending || !title.trim()}><Plus className="size-3.5" /> Add</button>
      </form>

      <div className="mt-5">
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: tr("task.everything") }, { value: "mine", label: tr("task.mine") }, { value: "ai", label: tr("task.ai") }]} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {COLS.map((c) => {
          const list = shown.filter((t) => t.status === c.status);
          return (
            <section key={c.status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { const t = tasks.find((x) => x.id === drag); if (t && t.status !== c.status) move(t, c.status); setDrag(null); }}
              className="min-h-40 rounded-sm bg-panel/50 p-2">
              <h2 className="flex items-center justify-between px-1 pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                {colLabel[c.status]}<span className="font-normal tabular-nums text-ink-faint">{list.length}</span>
              </h2>
              <ul className="space-y-2">
                {list.map((t) => {
                  const ai = t.assignee?.startsWith("ai:");
                  return (
                    <li key={t.id} draggable onDragStart={() => setDrag(t.id)}
                      className={`cursor-grab rounded-sm border bg-surface p-2.5 text-[0.8rem] ${drag === t.id ? "opacity-50" : ""} ${ai ? "border-accent/30" : "border-rule"}`}>
                      <button className="block w-full text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
                        <span className={`block text-ink ${t.status === "done" ? "line-through decoration-ink-faint" : ""}`}>{t.title}</span>
                        {t.link ? <a href={t.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex items-center gap-1 text-[0.74rem] font-medium text-good hover:underline">Open in WhatsApp ↗</a> : null}
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.7rem] text-ink-faint">
                          {ai ? <Bot className="size-3 text-accent" /> : null}
                          {assigneeLabel(t.assignee, roles, members)}
                          {t.due ? <span className={t.due < todayIso() && t.status !== "done" ? "text-bad" : ""}>· due {dateShort(t.due)}</span> : null}
                          <span suppressHydrationWarning>· {ago(t.createdAt)}</span>
                        </span>
                      </button>
                      {open === t.id ? (
                        <div className="mt-2 space-y-2 border-t border-rule pt-2">
                          {t.detail ? <p className="text-ink-soft">{t.detail}</p> : null}
                          {t.result ? <div className="rounded-sm bg-panel/60 p-2"><Prose text={t.result} /></div> : null}
                          <div className="flex flex-wrap items-center gap-1">
                            <AssigneeSelect value={t.assignee} roles={roles} members={members} onChange={(v) => start(async () => { await orAlert(saveTask({ ...t, assignee: v })); })} />
                            {COLS.filter((x) => x.status !== t.status).map((x) => <button key={x.status} className={btnQuiet} onClick={() => move(t, x.status)}>→ {colLabel[x.status]}</button>)}
                            {ai && canAi && t.status !== "done" ? (
                              <button className={btnGhost} disabled={pending}
                                onClick={() => { setWorking(t.id); start(async () => { await orAlert(workOnTask(t.id)); setWorking(null); }); }}>
                                <Play className="size-3" /> {working === t.id ? "Working…" : "Let AI work on it"}
                              </button>
                            ) : null}
                            <button className={`${btnQuiet} ml-auto`} aria-label="Delete task" onClick={() => start(async () => { await orAlert(deleteTask(t.id)); })}><Trash2 className="size-3.5" /></button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
