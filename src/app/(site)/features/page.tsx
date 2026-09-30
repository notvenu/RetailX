import type { Metadata } from "next";
import Link from "next/link";
import { Actions, MODULES, NumberedNote, PageIntro, Wrap } from "@/components/site";

export const metadata: Metadata = {
  title: "Features — RetailX",
  description: "The seven modules of RetailX: finance, sales, stock, payroll, forecasting, analytics and branch evaluation.",
};

export default function FeaturesPage() {
  return (
    <>
      <PageIntro title="Notes to the accounts">
        <p>
          The seven modules of RetailX. They share one set of records, so what one module keeps, every other module
          can read.
        </p>
      </PageIntro>

      <Wrap className="mt-14 grid gap-12 lg:grid-cols-12">
        <nav aria-label="Contents" className="lg:col-span-3">
          <div className="lg:sticky lg:top-8">
            <h2 className="border-b-2 border-ink pb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">
              Contents
            </h2>
            <ol>
              {MODULES.map((m, i) => (
                <li key={m.title}>
                  <Link
                    href={`#note-${i + 1}`}
                    className="grid grid-cols-[1.6rem_1fr] border-b border-rule py-2 text-[0.88rem] text-ink-soft hover:text-accent"
                  >
                    <span>{i + 1}</span>
                    {m.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="border-t border-rule-strong lg:col-span-9">
          {MODULES.map((m, i) => (
            <NumberedNote key={m.title} n={i + 1} title={m.title}>
              <p>{m.long}</p>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[0.86rem] text-ink">
                {m.keeps.map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span aria-hidden className="h-px w-3 bg-ink-soft" />
                    {k}
                  </li>
                ))}
              </ul>
            </NumberedNote>
          ))}
          <div className="mt-12">
            <Actions link={{ href: "/how-it-works", label: "How it works" }} />
          </div>
        </div>
      </Wrap>
    </>
  );
}
