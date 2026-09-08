import { auth } from "@/auth";
import { PageHeader, Section, Figure, FigureRow, StatusPill, KeyValue } from "@/components/ui";
import { EmployeesPanel } from "@/components/CollectionPanel";
import { money, moneyCompact } from "@/lib/format";
import { kpi, kpiDeltas } from "@/lib/kpi";
import { EMPLOYEES, PAYROLL_RUN, ORG } from "@/lib/mock";

const probation = EMPLOYEES.filter((e) => e.status === "Probation").length;

export default async function HrPage() {
  const session = await auth();

  return (
    <>
      <PageHeader
        title="People & payroll"
        meta={`${ORG.name} · ${PAYROLL_RUN.headcount} employees · sample data`}
      />

      <div className="mt-6">
        <FigureRow>
          <Figure label="Headcount" value={String(PAYROLL_RUN.headcount)} />
          <Figure label="Net payroll — September" value={moneyCompact(PAYROLL_RUN.net)} higherIsBetter={false} />
          <Figure label={kpi("rev_per_emp").label} value={moneyCompact(kpi("rev_per_emp").value)} deltas={kpiDeltas(kpi("rev_per_emp"))} />
          <Figure label="On probation" value={String(probation)} />
        </FigureRow>
      </div>

      <Section title={`Payroll run — ${PAYROLL_RUN.period}`} actions={<StatusPill>{PAYROLL_RUN.status}</StatusPill>}>
        <KeyValue
          items={[
            { k: "Headcount paid", v: String(PAYROLL_RUN.headcount) },
            { k: "Gross", v: money(PAYROLL_RUN.gross) },
            { k: "Deductions", v: money(PAYROLL_RUN.deductions) },
            { k: "Net disbursed", v: money(PAYROLL_RUN.net) },
          ]}
        />
      </Section>

      <EmployeesPanel role={session?.user.role} />
    </>
  );
}
