import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmEmail } from "@/app/actions";

export const metadata = { title: "Confirm email · RetailX" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { token, done } = await searchParams;
  async function confirm() {
    "use server";
    const ok = typeof token === "string" && (await confirmEmail(token));
    redirect(`/verify?done=${ok ? "ok" : "expired"}`);
  }
  const card = (title: string, body: string, action?: React.ReactNode) => (
    <main className="grid min-h-screen place-items-center bg-panel px-4">
      <div className="max-w-sm rounded-md border border-rule bg-surface p-8 text-center shadow-overlay">
        <h1 className="text-[1.1rem] font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-[0.85rem] text-ink-soft">{body}</p>
        {action ?? <Link href="/dashboard" className="mt-5 inline-block text-[0.85rem] font-medium text-accent hover:underline">Go to RetailX</Link>}
      </div>
    </main>
  );
  if (done === "ok") return card("Email confirmed", "Thanks. Password resets and notifications will come to this address.");
  if (done === "expired" || typeof token !== "string") return card("This link has expired", "Confirmation links work once, for 24 hours. Send a new one from Profile & security.");
  return card("Confirm your email", "One click to confirm this address belongs to you.", (
    <form action={confirm} className="mt-5">
      <button className="rounded-sm bg-accent px-4 py-2 text-[0.85rem] font-medium text-white hover:bg-accent-hover">Confirm email</button>
    </form>
  ));
}
