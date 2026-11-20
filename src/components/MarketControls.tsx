"use client";

import { useState, useTransition } from "react";
import { Globe } from "lucide-react";
import { refreshBenchmarks, saveBenchmark } from "@/app/actions";
import { btnGhost, btnPrimary, btnQuiet, control } from "@/components/ui";
import { failed } from "@/lib/result";
import type { Benchmark } from "@/lib/benchmarks";

export function ResearchButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="flex items-center gap-3">
      {msg ? <span role="status" className="max-w-xs text-[0.75rem] text-ink-soft">{msg}</span> : null}
      <button
        className={btnPrimary}
        disabled={pending}
        onClick={() => start(async () => {
          setMsg("Searching the web for current figures. This can take a minute…");
          const r = await refreshBenchmarks();
          setMsg(failed(r) ? r.__error : r.saved.length ? `Updated ${r.saved.length} with sourced figures${r.skipped ? `; ${r.skipped} had no reliable source and keep their range` : ""}.` : "No reliable current figures found; the ranges are unchanged.");
        })}
      >
        <Globe className="size-3.5" /> {pending ? "Researching…" : "Research current figures"}
      </button>
    </span>
  );
}

export function RangeEdit({ kpiId, current }: { kpiId: string; current: Benchmark }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ p25: String(current.p25), p50: String(current.p50), p75: String(current.p75), source: current.origin === "owner" ? current.source ?? "" : "" });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const run = (range: Parameters<typeof saveBenchmark>[1]) => start(async () => {
    const r = await saveBenchmark(kpiId, range);
    if (failed(r)) setErr(r.__error);
    else { setErr(""); setOpen(false); }
  });

  if (!open)
    return (
      <span className="mt-1 flex gap-1">
        <button className={`${btnQuiet} -ml-2 text-[0.72rem]`} onClick={() => setOpen(true)}>Set your own</button>
        {current.origin !== "builtin" ? <button className={`${btnQuiet} text-[0.72rem]`} disabled={pending} onClick={() => run(null)}>Use built-in</button> : null}
      </span>
    );
  return (
    <form
      className="mt-2 grid grid-cols-3 gap-2"
      onSubmit={(e) => { e.preventDefault(); run({ p25: Number(v.p25), p50: Number(v.p50), p75: Number(v.p75), source: v.source.trim() }); }}
    >
      {(["p25", "p50", "p75"] as const).map((key) => (
        <label key={key} className="text-[0.7rem] text-ink-faint">
          {key === "p25" ? "Low (25%)" : key === "p50" ? "Typical" : "High (75%)"}
          <input className={`${control} w-full`} inputMode="decimal" required value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
        </label>
      ))}
      <label className="col-span-3 text-[0.7rem] text-ink-faint">
        Source (optional)
        <input className={`${control} w-full`} placeholder="e.g. trade association report, 2026" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} />
      </label>
      {err ? <p role="alert" className="col-span-3 text-[0.75rem] text-bad">{err}</p> : null}
      <span className="col-span-3 flex gap-2">
        <button className={btnPrimary} disabled={pending}>Save</button>
        <button type="button" className={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
      </span>
    </form>
  );
}
