import type { Metadata } from "next";
import { Chapter, NumberedNote, PageIntro, TextLink } from "@/components/site";
import { ContactForm, CONTACT_EMAIL } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "About and contact — RetailX",
  description: "What RetailX is, the principles it is built on, and how to get in touch.",
};

const PRINCIPLES = [
  { title: "Figures before charts", body: "State the number and how it moved first. A chart supports the figure; it never replaces it." },
  { title: "Traceable to the transaction", body: "Every figure on a report can be followed back to the records that produced it." },
  { title: "Scenarios, not single numbers", body: "A decision arrives with conservative, base and optimistic cases and the risk in each." },
  { title: "The books follow the job", body: "Each person sees what their role needs, and finance and people records stay with those who need them." },
  { title: "One vocabulary", body: "The same tables, forms and controls on every module, so learning one page teaches the rest." },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro title="About RetailX">
        <p>
          RetailX is an ERP for small and mid-sized retailers with more than one branch. It is built on one idea: the
          records a shop already keeps for its accounts can also forecast its next month and test its next branch.
        </p>
        <p className="mt-4">
          Finance, sales, stock, purchasing and payroll feed one set of books, and analytics, forecasting and decision
          support read from those same books rather than from a spreadsheet beside them.
        </p>
      </PageIntro>

      <Chapter title="Principles">
        <div className="border-t border-rule-strong">
          {PRINCIPLES.map((p, i) => (
            <NumberedNote key={p.title} n={i + 1} title={p.title}>
              {p.body}
            </NumberedNote>
          ))}
        </div>
      </Chapter>

      <Chapter
        title="Built with"
        lede="A single web app, with the models trained in Python and their results shipped alongside it."
      >
        <dl className="max-w-[38rem] border-t border-rule text-[0.92rem]">
          {[
            ["Web app", "Next.js, TypeScript, Tailwind CSS"],
            ["Sign-in and roles", "Auth.js"],
            ["Charts and tables", "Hand-drawn SVG, no chart library"],
            ["Models", "Python: pandas, statsmodels"],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 border-b border-rule py-3 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <dt className="font-medium text-ink">{k}</dt>
              <dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8">
          <TextLink href="/how-it-works">How the models work</TextLink>
        </div>
      </Chapter>

      <Chapter
        id="contact"
        title="Contact"
        lede={
          <>
            Questions, or want a walkthrough of the branch evaluation? Write to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-accent underline-offset-2 hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            or use the form.
          </>
        }
      >
        <div className="max-w-[44rem]">
          <ContactForm />
        </div>
      </Chapter>
    </>
  );
}
