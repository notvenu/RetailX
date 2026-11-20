"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Brain, Play, Plus, Send, Trash2, X } from "lucide-react";
import { clearThread, saveMemory } from "@/app/actions";
import { AUTONOMY } from "@/lib/catalog";
import { ago } from "@/lib/format";
import type { AiRole, ChatMsg, Task } from "@/lib/model";
import { Icon } from "@/components/icon";
import { Prose, StatusPill, btnGhost, btnPrimary, btnQuiet, control } from "@/components/ui";
import { orAlert } from "@/lib/result";

/** Reads the NDJSON stream from /api/ai, calling back as text and tool status arrive. */
export async function streamAi(body: object, on: { text: (d: string) => void; status: (s: string) => void }) {
  const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error((await res.text()) || "The AI team is unavailable.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      const m = JSON.parse(line) as { t: string; d?: string; s?: string; m?: string };
      if (m.t === "text") on.text(m.d ?? "");
      else if (m.t === "status") on.status(m.s ?? "");
      else if (m.t === "error") throw new Error(m.m);
    }
  }
}

export function RoleChat({ role, thread, tasks, starters, briefing, live }: {
  role: AiRole; thread: ChatMsg[]; tasks: Task[]; starters: string[]; briefing: string; live: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread.length, reply, asked]);
  // the refreshed thread now holds the exchange: drop the live bubble
  useEffect(() => { if (!busy) { setAsked(null); setReply(""); } }, [thread.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (body: object, label: string) => {
    if (busy) return;
    setBusy(true); setError(""); setAsked(label); setReply(""); setStatus("");
    try {
      await streamAi(body, { text: (d) => { setStatus(""); setReply((r) => r + d); }, status: setStatus });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    router.refresh();
  };
  const send = (msg: string) => { if (msg.trim()) { setText(""); void run({ roleId: role.id, prompt: msg }, msg); } };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-h-[calc(100vh-10rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-rule pb-4">
          <Link href="/ai" className={btnQuiet} aria-label="Back to AI team"><ArrowLeft className="size-4" /></Link>
          <span className="grid size-10 place-items-center rounded-full bg-accent-wash text-accent"><Icon name={role.icon} className="size-5" /></span>
          <div className="min-w-0">
            <h1 className="text-[1.2rem] font-semibold tracking-[-0.02em] text-ink">{role.name} · {role.title}</h1>
            <p className="truncate text-[0.76rem] text-ink-faint">{AUTONOMY.find((a) => a.value === role.autonomy)?.about}</p>
          </div>
          {thread.length ? (
            <button className={`${btnQuiet} ml-auto`} disabled={pending || busy} onClick={() => confirm("Clear this conversation?") && start(async () => { await orAlert(clearThread(role.id)); })}>
              <Trash2 className="size-3.5" /> Clear
            </button>
          ) : null}
        </div>

        <div className="flex-1 space-y-5 py-6" aria-live="polite">
          {!thread.length && !asked ? <div className="rounded-sm border border-rule bg-panel/40 p-4"><Prose text={briefing} /></div> : null}
          {thread.map((m, i) => <Bubble key={i} m={m} role={role} />)}
          {asked ? (
            <>
              <div className="ml-auto max-w-[85%] rounded-md bg-accent px-3.5 py-2 text-[0.84rem] text-white">{asked}</div>
              <div className="flex max-w-[92%] gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-wash text-accent"><Icon name={role.icon} className="size-3.5" /></span>
                <div className="min-w-0">
                  {reply ? <Prose text={reply} /> : null}
                  {busy && (status || !reply) ? (
                    <p className="mt-1 flex items-center gap-2 text-[0.8rem] text-ink-faint">
                      <span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-accent" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
                      {status || (live ? `${role.name} is thinking` : `${role.name} is reading your KPIs`)}…
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
          {error ? <p role="alert" className="text-[0.8rem] text-bad">{error}</p> : null}
          <div ref={end} />
        </div>

        <div className="sticky bottom-0 border-t border-rule bg-paper pb-2 pt-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {starters.map((s) => (
              <button key={s} disabled={busy} onClick={() => send(s)} className="rounded-full border border-rule-strong px-3 py-1 text-[0.75rem] text-ink-soft transition-colors hover:border-accent hover:text-accent">{s}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2">
            <textarea rows={2} aria-label={`Message ${role.name}`} className={`${control} flex-1 resize-none`}
              placeholder={live ? `Ask ${role.name} anything about the business…` : `Ask ${role.name} for a briefing…`}
              value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
            <button className={`${btnPrimary} self-end`} disabled={busy || !text.trim()} aria-label="Send"><Send className="size-4" /></button>
          </form>
        </div>
      </div>

      <aside className="space-y-6">
        <section>
          <h2 className="border-b border-rule pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Responsibilities</h2>
          <ul className="mt-2 space-y-1 text-[0.8rem] text-ink-soft">{role.responsibilities.map((r) => <li key={r}>• {r}</li>)}</ul>
        </section>
        <Memory role={role} />
        <section>
          <h2 className="border-b border-rule pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Tasks for {role.name}</h2>
          {tasks.length ? (
            <ul className="mt-2 divide-y divide-rule">
              {tasks.map((t) => (
                <li key={t.id} className="py-2.5 text-[0.8rem]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-ink">{t.title}</span>
                    <StatusPill>{t.needsApproval ? "Pending" : t.status}</StatusPill>
                  </div>
                  {t.result ? <p className="mt-1 line-clamp-3 text-[0.74rem] text-ink-faint">{t.result.replace(/[*_`]/g, "")}</p> : null}
                  {t.status !== "done" && !t.needsApproval ? (
                    <button className={`${btnGhost} mt-1.5 px-2 py-1 text-[0.74rem]`} disabled={busy} onClick={() => void run({ taskId: t.id }, `Work on: ${t.title}`)}>
                      <Play className="size-3" /> {live ? "Work on it" : "Get guidance"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[0.78rem] text-ink-faint">No tasks yet. Assign one from Tasks or an automation.</p>}
        </section>
      </aside>
    </div>
  );
}

function Bubble({ m, role }: { m: ChatMsg; role: AiRole }) {
  return (
    <div className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[92%]"}>
      {m.role === "user" ? (
        <div className="rounded-md bg-accent px-3.5 py-2 text-[0.84rem] text-white">{m.text}</div>
      ) : (
        <div className="flex gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-wash text-accent"><Icon name={role.icon} className="size-3.5" /></span>
          <div className="min-w-0"><Prose text={m.text} /></div>
        </div>
      )}
      <p suppressHydrationWarning className={`mt-1 text-[0.68rem] text-ink-faint ${m.role === "user" ? "text-right" : "pl-10"}`}>{m.by ? `${m.by} · ` : ""}{ago(m.at)}</p>
    </div>
  );
}

/** What this role remembers about the business: taught in conversation, or edited here. */
function Memory({ role }: { role: AiRole }) {
  const [items, setItems] = useState(role.memory ?? []);
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();
  useEffect(() => setItems(role.memory ?? []), [role.memory]);
  const save = (next: string[]) => { setItems(next); start(async () => { await orAlert(saveMemory(role.id, next)); }); };
  return (
    <section>
      <h2 className="flex items-center gap-1.5 border-b border-rule pb-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        <Brain className="size-3.5" /> {role.name} remembers
      </h2>
      {items.length ? (
        <ol className="mt-2 space-y-1 text-[0.78rem] text-ink-soft">
          {items.map((m, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-ink-faint">{i + 1}.</span><span className="flex-1">{m}</span>
              <button aria-label="Forget" className="opacity-50 hover:opacity-100" onClick={() => save(items.filter((_, j) => j !== i))}><X className="size-3" /></button>
            </li>
          ))}
        </ol>
      ) : <p className="mt-2 text-[0.75rem] text-ink-faint">Nothing yet. Tell {role.name} a standing rule (&ldquo;we never discount dairy&rdquo;) and it&apos;ll remember.</p>}
      <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { save([...items, draft.trim()]); setDraft(""); } }}>
        <input aria-label="Add to memory" className={`${control} flex-1 text-[0.78rem]`} placeholder="Add a fact or rule" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className={btnQuiet} aria-label="Add"><Plus className="size-3.5" /></button>
      </form>
    </section>
  );
}
