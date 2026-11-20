"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runPayroll } from "@/app/actions";
import { money, type Fmt } from "@/lib/format";
import { payRun } from "@/lib/payroll";
import { failed } from "@/lib/result";
import type { RecordRow } from "@/lib/model";
import { btnPrimary, control, DataTable, Note, Section } from "@/components/ui";

/** Pick a month, see everyone's gross, PF, ESI and net, and create the pay entries in one go. */
export function PayrollRun({ employees, payroll, fmt, today }: { employees: RecordRow[]; payroll: RecordRow[]; fmt: Fmt; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const lines = useMemo(() => payRun(employees, payroll, month), [employees, payroll, month]);
  const todo = lines.filter((l) => !l.done);
  const m = (n: number) => money(n, fmt);
  const sum = (k: "gross" | "deductions" | "net") => todo.reduce((s, l) => s + l[k], 0);

  return (
    <Section title="Run payroll" meta={todo.length ? `${todo.length} to pay · net ${m(sum("net"))}` : lines.length ? "everyone is already paid for this month" : "no salaries on the Team list"}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="month" aria-label="Month" className={`${control} w-44`} value={month} onChange={(e) => { setMonth(e.target.value); setMsg({}); }} />
        <button className={btnPrimary} disabled={pending || !todo.length} onClick={() => start(async () => {
          const r = await runPayroll(month);
          if (failed(r)) return setMsg({ error: r.__error });
          setMsg({ ok: `${r.added} pay entries created as Pending. Mark each Paid after you transfer the salary.` });
          router.refresh();
        })}>Create {todo.length || ""} pay entries</button>
      </div>
      {msg.error ? <p role="alert" className="mb-3 text-[0.82rem] text-bad">{msg.error}</p> : null}
      {msg.ok ? <p role="status" className="mb-3 text-[0.82rem] text-good">{msg.ok}</p> : null}
      <DataTable
        getKey={(l) => l.employee}
        rows={lines}
        empty="Add people with a monthly salary in Team."
        columns={[
          { key: "e", header: "Employee", render: (l) => <span className="font-medium">{l.employee}</span> },
          { key: "g", header: "Gross", align: "right", render: (l) => m(l.gross) },
          { key: "p", header: "PF", align: "right", render: (l) => (l.pf ? m(l.pf) : "—") },
          { key: "s", header: "ESI", align: "right", render: (l) => (l.esi ? m(l.esi) : "—") },
          { key: "n", header: "Net pay", align: "right", render: (l) => <span className="font-semibold">{m(l.net)}</span> },
          { key: "d", header: "", render: (l) => (l.done ? <span className="text-[0.75rem] text-good">Already in Payroll</span> : null) },
        ]}
      />
      <Note>PF 12% of gross up to ₹15,000; ESI 0.75% when gross is ₹21,000 or less. Professional tax, TDS and unpaid-leave cuts are not included: edit a row after creating it if needed.</Note>
    </Section>
  );
}
