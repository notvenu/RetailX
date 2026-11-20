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
  { title: "Shaped by the business", body: "Industry presets are a starting point. Modules, fields, KPIs, forecasts, AI roles and the look are all the owner's to change." },
  { title: "Forecasts show their working", body: "Every forecast carries its back-test error and a range, and says when it is no better than a simple guess." },
  { title: "AI that knows its limits", body: "AI roles quote only figures the books can produce, and act only as far as the owner's chosen autonomy allows." },
  { title: "The books follow the job", body: "Each person sees what their role needs, and finance and people records stay with those who need them." },
  { title: "One vocabulary", body: "The same tables, forms and controls on every module, so learning one page teaches the rest." },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro title="About RetailX">
        <p>
          RetailX is a service for micro, small and medium enterprises. It is built on one idea: a small business
          deserves the systems and the leadership team a large one has, shaped to its own trade and its own size.
        </p>
        <p className="mt-4">
          Each business gets its own workspace: the registers it keeps, the KPIs it runs by, forecasts tested on its own
          history, and AI roles that coach the owner and take work off their plate.
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
        lede="A single web app. Forecasting and analytics run in TypeScript on your records; AI roles use Claude, or any free OpenAI-compatible model such as Gemini or Groq."
      >
        <dl className="max-w-[38rem] border-t border-rule text-[0.92rem]">
          {[
            ["Web app", "Next.js, TypeScript, Tailwind CSS"],
            ["Sign-in and roles", "Auth.js"],
            ["Charts and tables", "Hand-drawn SVG, no chart library"],
            ["Forecasting", "Ten models, rolling-origin back-tests, in TypeScript"],
            ["AI roles", "Claude, or a free model (Gemini, Groq, Ollama), with tools that read the books"],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 border-b border-rule py-3 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <dt className="font-medium text-ink">{k}</dt>
              <dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8">
          <TextLink href="/how-it-works">How it works</TextLink>
        </div>
      </Chapter>

      <Chapter
        id="contact"
        title="Contact"
        lede={
          <>
            Questions, or want a walkthrough for your industry? Write to{" "}
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
