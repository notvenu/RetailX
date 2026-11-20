import Link from "next/link";
import { redirect } from "next/navigation";
import { updateBusiness } from "@/lib/db";
import { ensureCounter } from "@/lib/catalog";
import { requireArea } from "@/lib/session";
import { lastRates, pointsBalance, quoteToBill } from "@/lib/pos";
import { todayIso } from "@/lib/metrics";
import { Counter } from "@/components/Counter";
import { Empty, PageHeader, btnGhost } from "@/components/ui";

export const metadata = { title: "Counter · RetailX" };

export default async function PosPage({ searchParams }: PageProps<"/pos">) {
  const { business: b, can, role } = await requireArea("sales");
  // ponytail: a one-time upgrade on first open (adds the payment-mode / barcode / GST fields); a no-op after that
  if (ensureCounter(structuredClone(b))) {
    await updateBusiness(b.id, (x) => { ensureCounter(x); });
    redirect("/pos");
  }
  const on = (id: string) => b.modules.some((m) => m.id === id && m.enabled);
  if (!on("sales")) return (
    <>
      <PageHeader title="Counter" />
      <div className="mt-6"><Empty title="Switch on Sales to bill at the counter">Settings → Modules → Sales. Every bill is saved there, line by line.</Empty></div>
    </>
  );

  const items = on("inventory") ? b.records.inventory ?? [] : [];
  const dues: Record<string, number> = {};
  for (const r of b.records.sales ?? []) {
    const p = String(r.data.phone ?? "").replace(/\D/g, "").slice(-10);
    if (p.length === 10 && r.data.payment && r.data.payment !== "Paid") dues[p] = (dues[p] ?? 0) + (Number(r.data.amount) || 0);
  }
  const points = pointsBalance(b.records.sales ?? [], b.records.customers ?? []);
  const customers = (b.records.customers ?? []).filter((r) => r.data.phone).map((r) => ({
    name: String(r.data.name ?? ""), phone: String(r.data.phone), limit: Number(r.data.credit_limit) || 0,
    points: points[String(r.data.phone).replace(/\D/g, "").slice(-10)] ?? 0,
    // ponytail: every known customer's last rate per item, sent with the page; fetch per phone if this grows large
    terms: Number(r.data.payment_terms) || 0,
    rates: Object.fromEntries(Object.entries(lastRates(b.records.sales ?? [], String(r.data.phone))).map(([k, v]) => [k, v.rate])),
  }));
  const today = todayIso();
  const offers = on("offers") ? (b.records.offers ?? []).filter((o) => o.data.active !== "No" && (!o.data.ends || String(o.data.ends) >= today)) : [];

  const qid = (await searchParams).quote;
  const quote = typeof qid === "string" && on("quotes") ? (b.records.quotes ?? []).find((r) => r.id === qid) : undefined;
  const prefill = quote ? { quoteId: quote.id, ...quoteToBill(quote, items) } : undefined;

  return (
    <>
      <PageHeader title="Counter"
        meta={on("inventory") ? `${items.length.toLocaleString("en-IN")} items to scan or search · bills go to Sales, stock comes off Stock` : "Switch on Stock in Settings to scan items and keep stock; until then type each line."}
        actions={<>
          {can("inventory") && on("inventory") ? <Link className={btnGhost} href="/labels">Barcode labels</Link> : null}
          <Link className={btnGhost} href="/dayclose">Day close</Link>
        </>} />
      <Counter items={items} customers={customers} dues={dues} fmt={{ currency: b.currency, locale: b.locale }}
        upi={b.upiId ? { upiId: b.upiId, payee: b.name } : undefined} canPurchase={can("purchases") && on("purchases") && on("inventory")} prefill={prefill}
        offers={offers} limits={role.id === "owner" ? {} : { maxDiscount: role.maxDiscount, priceEdit: role.priceEdit }}
        receipt={b.counter?.receipt ?? "80mm"} today={today} tcsRate={b.counter?.tcsRate ?? 0} hasPin={!!b.counter?.pinHash} />
    </>
  );
}
