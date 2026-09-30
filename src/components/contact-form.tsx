"use client";

import { useState } from "react";

// ponytail: placeholder inbox, no backend; swap for the team's real address (or a form endpoint) before publishing
export const CONTACT_EMAIL = "hello@retailx.test";

const field =
  "mt-1.5 w-full rounded-[4px] border border-rule-strong bg-white px-3 py-2 text-[0.9rem] text-ink outline-none transition-colors duration-150 placeholder:text-ink-soft/70 focus:border-accent";

export function ContactForm() {
  const [opened, setOpened] = useState(false);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const name = String(f.get("name")).trim();
        const org = String(f.get("org") ?? "").trim();
        const subject = `RetailX: ${org || name}`;
        const body = `${f.get("message")}\n\n${name}${org ? `, ${org}` : ""}\n${f.get("email")}`;
        window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        setOpened(true);
      }}
    >
      <label className="block text-[0.84rem] font-medium text-ink">
        Name
        <input name="name" required autoComplete="name" className={field} />
      </label>
      <label className="block text-[0.84rem] font-medium text-ink">
        Email
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className="block text-[0.84rem] font-medium text-ink sm:col-span-2">
        Business or organisation <span className="font-normal text-ink-soft">(optional)</span>
        <input name="org" autoComplete="organization" className={field} />
      </label>
      <label className="block text-[0.84rem] font-medium text-ink sm:col-span-2">
        Message
        <textarea
          name="message"
          required
          rows={5}
          placeholder="What you'd like to know, or the branches you run"
          className={`${field} resize-y leading-relaxed`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-2">
        <button
          type="submit"
          className="rounded-[4px] bg-accent px-4 py-2.5 text-[0.88rem] font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
        >
          Write the email
        </button>
        <p role="status" className="text-[0.8rem] leading-relaxed text-ink-soft">
          {opened
            ? `Your email app should now have the message ready to send. If nothing opened, write to ${CONTACT_EMAIL}.`
            : "Opens your email app with this message filled in. Nothing is sent from this page."}
        </p>
      </div>
    </form>
  );
}
