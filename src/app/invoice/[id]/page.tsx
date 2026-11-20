import { EwayBill } from "@/components/EwayBill";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { money } from "@/lib/format";
import { invoiceTax } from "@/lib/gst";
import { upiLink, waLink } from "@/lib/links";
import { getCtx } from "@/lib/session";
import { InvoiceActions } from "@/components/InvoiceActions";

export const metadata = { title: "Invoice · RetailX" };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A printable tax invoice for one bill: every Sales line sharing the invoice number (a counter bill), or the single
 * record. `?size=80mm` (or 58mm) lays it out for a thermal receipt printer; `?print=1` opens the print dialog at once.
 */
export default async function InvoicePage({ params, searchParams }: PageProps<"/invoice/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const receipt = sp.size === "80mm" || sp.size === "58mm";
  const width = sp.size === "58mm" ? "58mm" : "80mm";
  const { business: b, can } = await getCtx();
  if (!can("sales")) notFound();
  const sales = b.records.sales ?? [];
  const rec = sales.find((r) => r.id === id);
  if (!rec) notFound();
  const d = rec.data;
  const lines = d.invoice ? sales.filter((r) => r.data.invoice === d.invoice).sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id)) : [rec];
  const fmt = { currency: b.currency, locale: b.locale };
  const m = (n: number) => money(n, fmt);

  const taxed = lines.map((r) => ({ r, t: invoiceTax(r.data, b.state) }));
  const inter = taxed[0].t.inter;
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst" | "total") => r2(taxed.reduce((s, x) => s + x.t[k], 0));
  const tcs = r2(lines.reduce((s, r) => s + (Number(r.data.tcs) || 0), 0));
  const goods = sum("total");
  const total = r2(goods + tcs);
  // A4 layouts (Settings → Counter & invoices, or ?layout=): classic, modern (a band in the business colour), compact
  const layout = receipt ? "receipt" : ["classic", "modern", "compact"].includes(String(sp.layout)) ? String(sp.layout) : b.counter?.layout ?? "classic";
  const due = String(lines.find((r) => r.data.due)?.data.due ?? "");
  const isReturn = total < 0;
  const slabs = [...new Set(taxed.map((x) => x.t.rate))].filter(Boolean).sort((a, c) => a - c).map((rate) => {
    const on = taxed.filter((x) => x.t.rate === rate);
    return { rate, tax: r2(on.reduce((s, x) => s + x.t.cgst + x.t.sgst + x.t.igst, 0)) };
  });
  const unpaid = lines.some((r) => r.data.payment && r.data.payment !== "Paid");
  const pay = b.upiId && !isReturn ? upiLink({ upiId: b.upiId, payee: b.name, amount: total, note: `Invoice ${d.invoice ?? ""}` }) : null;
  const qr = pay && unpaid ? await QRCode.toDataURL(pay, { margin: 1, width: 160 }) : null;
  const share = d.phone
    ? waLink(String(d.phone), `${b.name}\n${isReturn ? "Credit note" : "Invoice"} ${d.invoice ?? ""} · ${d.date ?? ""}\n${lines.map((r) => `${r.data.item ?? "Item"} × ${r.data.quantity ?? 1}: ${m(Number(r.data.amount) || 0)}`).join("\n")}\nTotal ${m(total)}${unpaid && pay ? `\nPay by UPI: ${pay}` : ""}\nThank you for your business!`)
    : null;
  const title = isReturn ? "Credit note" : b.gstin && slabs.length ? "Tax invoice" : receipt ? "Receipt" : "Invoice";

  const totals: [string, string][] = [
    ["Taxable value", m(sum("taxable"))],
    ...slabs.flatMap(({ rate, tax }): [string, string][] => inter ? [[`IGST @ ${rate}%`, m(tax)]] : [[`CGST @ ${rate / 2}%`, m(r2(tax / 2))], [`SGST @ ${rate / 2}%`, m(r2(tax / 2))]]),
    ...(tcs ? [["Invoice value", m(goods)], ["TCS collected", m(tcs)]] as [string, string][] : []),
  ];

  return (
    <main className="min-h-screen bg-panel px-4 py-8 print:bg-white print:p-0">
      <InvoiceActions share={share} autoPrint={sp.print === "1"} />
      {!receipt && !isReturn && d.invoice ? <div className="mx-auto mb-3 flex max-w-2xl justify-end print:hidden"><EwayBill lines={lines} biz={{ name: b.name, gstin: b.gstin, state: b.state, city: b.city }} /></div> : null}
      {receipt ? <style>{`@page { size: ${width} auto; margin: 3mm; }`}</style> : null}
      <article className={`mx-auto rounded-md border border-rule bg-white text-[#1d2433] print:border-0 ${receipt ? (width === "58mm" ? "max-w-[58mm] p-2 text-[0.7rem]" : "max-w-[80mm] p-3 text-[0.78rem]") : layout === "compact" ? "max-w-2xl p-5 text-[0.84rem]" : layout === "modern" ? "max-w-2xl overflow-hidden p-0" : "max-w-2xl p-8"}`}>
        {layout === "modern" ? <div aria-hidden className="h-2" style={{ background: b.theme.accent }} /> : null}
        <div className={layout === "modern" ? "p-8" : ""}>
        <header className={receipt ? "border-b border-dashed border-[#999] pb-2 text-center" : `flex items-start justify-between gap-6 border-b ${layout === "modern" ? "border-transparent pb-4" : "border-[#d3d7de] pb-5"} ${layout === "compact" ? "pb-3" : ""}`}>
          <div>
            <h1 className={receipt ? "text-[1rem] font-semibold" : layout === "modern" ? "text-[1.6rem] font-semibold tracking-[-0.02em]" : "text-[1.3rem] font-semibold"} style={layout === "modern" ? { color: b.theme.accent } : undefined}>{b.name}</h1>
            <p className="text-[0.82em] text-[#4b5565]">{[b.city, b.country].filter(Boolean).join(", ")}</p>
            {b.gstin ? <p className="text-[0.82em] text-[#4b5565]">GSTIN {b.gstin}</p> : null}
          </div>
          <div className={receipt ? "mt-1" : "text-right"}>
            <p className="text-[0.7em] font-semibold uppercase tracking-[0.14em] text-[#4b5565]">{title}</p>
            <p className="font-medium">{String(d.invoice ?? rec.id.slice(-6).toUpperCase())}</p>
            {d.against ? <p className="text-[0.82em] text-[#4b5565]">Against invoice {String(d.against)}</p> : null}
            {unpaid && due ? <p className="text-[0.82em] font-semibold text-[#b42318]">Due by {due}</p> : null}
            <p className="text-[0.82em] text-[#4b5565]">{String(d.date ?? "")}{receipt ? ` · ${new Date(rec.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : ""}</p>
          </div>
        </header>
        {d.customer && d.customer !== "Walk-in" || d.customer_gstin || d.phone || !receipt ? (
          <section className={`grid gap-4 border-b py-3 text-[0.85em] ${receipt ? "border-dashed border-[#999]" : "border-[#e5e7eb] sm:grid-cols-2"}`}>
            <div>
              <p className="text-[0.8em] font-semibold uppercase tracking-[0.12em] text-[#8a94a6]">Billed to</p>
              <p className="font-medium">{String(d.customer || "Walk-in customer")}</p>
              {d.customer_gstin ? <p className="text-[#4b5565]">GSTIN {String(d.customer_gstin)}</p> : null}
              {d.phone ? <p className="text-[#4b5565]">{String(d.phone)}</p> : null}
            </div>
            {!receipt ? (
              <div className="sm:text-right">
                <p className="text-[0.8em] font-semibold uppercase tracking-[0.12em] text-[#8a94a6]">Supply</p>
                <p>{inter ? "Inter-state (IGST)" : "Intra-state"}</p>
                {d.location ? <p className="text-[#4b5565]">{String(d.location)}</p> : null}
              </div>
            ) : null}
          </section>
        ) : null}
        <table className="mt-3 w-full text-[0.85em]">
          <thead>
            <tr className="border-b border-[#d3d7de] text-left text-[0.78em] uppercase tracking-[0.1em] text-[#8a94a6]">
              <th className="pb-2">Item</th>{receipt ? null : <th className="pb-2">HSN/SAC</th>}<th className="pb-2 text-right">Qty</th>
              {receipt ? null : <th className="pb-2 text-right">GST</th>}<th className="pb-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {taxed.map(({ r, t }) => (
              <tr key={r.id} className="border-b border-[#e5e7eb] align-top">
                <td className="py-1.5 pr-2">{String(r.data.item ?? r.data.category ?? "Goods / services")}{r.data.serial ? <span className="block text-[0.82em] text-[#4b5565]">S/N {String(r.data.serial)}</span> : null}</td>
                {receipt ? null : <td className="py-1.5">{String(r.data.hsn ?? "—")}</td>}
                <td className="py-1.5 text-right tabular-nums">{String(r.data.quantity ?? 1)}</td>
                {receipt ? null : <td className="py-1.5 text-right tabular-nums">{t.rate}%</td>}
                <td className="py-1.5 text-right tabular-nums">{m(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`mt-3 flex flex-wrap items-end justify-between gap-4 ${receipt ? "flex-col-reverse items-stretch" : ""}`}>
          {qr ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`UPI QR to pay ${m(total)}`} width={128} height={128} className="mx-auto" />
              <p className="mt-1 text-[0.72rem] text-[#4b5565]">Scan to pay by UPI · {b.upiId}</p>
            </div>
          ) : <span />}
          <dl className={receipt ? "text-[0.85em]" : "min-w-56 text-[0.85rem]"}>
            {totals.map(([k, v]) => <div key={k} className="flex justify-between gap-6 py-0.5"><dt className="text-[#4b5565]">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}
            <div className="mt-1 flex justify-between gap-6 border-t border-[#1d2433] pt-1.5 font-semibold"><dt>{isReturn ? "Refund" : "Total"}</dt><dd className="tabular-nums">{m(Math.abs(total))}</dd></div>
            <div className="flex justify-between gap-6 pt-1 text-[0.9em]"><dt className="text-[#4b5565]">{isReturn ? "Refunded" : "Status"}</dt>
              <dd className={unpaid ? "text-[#b42318]" : "text-[#067647]"}>{unpaid ? "Unpaid" : String(d.mode ? `Paid · ${d.mode}` : d.payment ?? "Paid")}</dd></div>
          </dl>
        </div>
        {(b.counter?.bank && !receipt) || b.counter?.terms ? (
          <section className={`mt-5 grid gap-3 border-t border-[#e5e7eb] pt-3 text-[0.78em] text-[#4b5565] ${receipt ? "text-center" : "sm:grid-cols-2"}`}>
            {b.counter?.bank && !receipt ? <div><p className="font-semibold uppercase tracking-[0.12em] text-[#8a94a6]">Bank details</p><p className="whitespace-pre-line">{b.counter.bank}</p></div> : null}
            {b.counter?.terms ? <div><p className="font-semibold uppercase tracking-[0.12em] text-[#8a94a6]">Terms</p><p className="whitespace-pre-line">{b.counter.terms}</p></div> : null}
          </section>
        ) : null}
        <p className={`mt-6 text-[0.72rem] text-[#8a94a6] ${receipt ? "text-center" : ""}`}>{lines.length} item{lines.length === 1 ? "" : "s"} · amounts include GST.{receipt ? " Thank you, visit again!" : " Generated with RetailX."}</p>
        </div>
      </article>
    </main>
  );
}
