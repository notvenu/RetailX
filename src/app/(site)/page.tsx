import type { Metadata } from "next";
import Link from "next/link";
import { Actions, Chain, Chapter, MODULES, RuledList, TextLink, Wrap } from "@/components/site";

export const metadata: Metadata = {
  title: "RetailX — the operating system for small business",
  description:
    "Sign up, describe your business, and get modules, KPIs, forecasts and an AI leadership team shaped to your industry. Built for MSMEs.",
};

export default function Home() {
  return (
    <>
      <Wrap className="grid gap-14 pt-16 lg:grid-cols-12 lg:gap-16 lg:pt-28">
        <div className="lg:col-span-7">
          <h1 className="text-[clamp(2.6rem,5.6vw,4.1rem)] font-semibold leading-[1.02] tracking-[-0.042em] text-balance text-ink">
            Run your business on a system built around it, with an AI team that reads the numbers.
          </h1>
          <p className="mt-7 max-w-[34rem] text-[1.1rem] leading-relaxed text-ink-soft">
            RetailX is a service for micro, small and medium businesses. Tell it what you do, and it assembles the
            registers, KPIs, forecasts and automations you need, then gives you an AI CFO, COO, GM and more who coach
            you from your own records. Every part of it can be reshaped.
          </p>
          <div className="mt-10">
            <Actions link={{ href: "/how-it-works", label: "How it works" }} />
          </div>
          <p className="mt-5 text-[0.86rem] text-ink-soft">
            Already set up? <Link href="/signin" className="font-medium text-accent hover:underline">Sign in</Link> with your email, phone or username.
          </p>
        </div>

        <div className="lg:col-span-5 lg:pt-3">
          <RuledList
            animate
            title="The questions it answers"
            rows={[
              { label: "How are we doing?", value: "Your KPIs against target and last period" },
              { label: "Why did it change?", value: "The category, channel or location behind it" },
              { label: "What comes next?", value: "Forecasts that prove their own accuracy" },
              { label: "What should I do?", value: "Advice, tasks and automations from your AI team" },
            ]}
          />
        </div>
      </Wrap>

      <Chapter
        title="Thirteen things it does, all shaped by you"
        lede="Nothing is fixed. The modules, the fields in them, the KPIs, the forecasts, the AI roles and the look of the workspace all start from your industry and stay yours to change."
      >
        <div className="grid gap-x-12 border-t border-rule md:grid-cols-2">
          {MODULES.map((m, i) => (
            <Link key={m.title} href={`/features#note-${i + 1}`} className="group grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-rule py-5">
              <span className="text-[1.15rem] font-light text-ink-faint transition-colors duration-150 group-hover:text-accent">{i + 1}</span>
              <span>
                <span className="block text-[1rem] font-semibold text-ink transition-colors duration-150 group-hover:text-accent">{m.title}</span>
                <span className="mt-1 block text-[0.88rem] leading-relaxed text-ink-soft">{m.short}</span>
              </span>
            </Link>
          ))}
        </div>
      </Chapter>

      <Chapter title="From sign-up to decisions" lede="Five steps, in this order, so every number and every piece of advice rests on what you actually recorded.">
        <Chain />
        <div className="mt-8">
          <TextLink href="/how-it-works">How onboarding, forecasts and AI roles work</TextLink>
        </div>
      </Chapter>

      <Chapter
        title="Set up in five minutes"
        lede="Create the owner account, answer a few questions about your business, adjust what we suggest, and invite your team. Each person signs in with their own login, already tied to their role."
      >
        <Actions link={{ href: "/features", label: "See everything it does" }} />
      </Chapter>
    </>
  );
}
