"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Printer, ScanBarcode, Trash2, X } from "lucide-react";
import { invoiceLines, saveBill, type BillInput } from "@/app/actions";
import { money, type Fmt } from "@/lib/format";
import { upiLink } from "@/lib/links";
import type { RecordRow } from "@/lib/model";
import { MODES, autoRate, billProfit, cashierCheck, discountWithPoints, findItems, isExpired, overLimit, parseQty, priceBill, r2, tenders, toLine, type BillKind, type CartLine, type Mode } from "@/lib/pos";
import { applyOffers, type Applied } from "@/lib/offers";
import { failed } from "@/lib/result";
import { CameraScan } from "@/components/CameraScan";
import { VoiceInput } from "@/components/VoiceInput";
import { ScanBill } from "@/components/ScanBill";
import { btnGhost, btnPrimary, btnQuiet, control, Segmented } from "@/components/ui";

type Bill = { kind: BillKind; lines: (CartLine & { key: string })[]; discount: string; mode: Mode; received: string; phone: string; customer: string; gstin: string; quoteId?: string; redeem?: string; coupon?: string; against?: string; tcs?: boolean };
/* Bills made while the connection was down wait here, on this device, and are sent when it returns. Each carries a
   clientId so a retry after a half-finished send never saves the bill twice. */
const QUEUE = "rx_pos_queue";
const queued = () => read<BillInput[]>(QUEUE, []);
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
// a send that never reached the server rejects with a network error; a server answer (even a refusal) does not
const offline = (e: unknown) => e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);

const blank = (): Bill => ({ kind: "sale", lines: [], discount: "", mode: "Cash", received: "", phone: "", customer: "", gstin: "" });
const key = () => Math.random().toString(36).slice(2);
const read = <T,>(k: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") ?? fallback; } catch { return fallback; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: bills just aren't kept */ } };

export type CounterProps = {
  items: RecordRow[];
  customers: { name: string; phone: string; limit?: number; points?: number; rates?: Record<string, number>; terms?: number }[];
  /** TCS % from Settings; 0 hides the option */
  tcsRate?: number;
  /** an owner PIN is set, so a cashier can ask the owner to approve a bill beyond their limits */
  hasPin?: boolean;
  /** live offers (Offers module): coupons, combos, near-expiry */
  offers?: RecordRow[];
  /** this cashier's limits; the server checks them again */
  limits?: { maxDiscount?: number; priceEdit?: boolean };
  receipt?: "80mm" | "58mm";
  today?: string;
  /** unpaid amount by the last 10 digits of a phone */
  dues: Record<string, number>;
  fmt: Fmt;
  upi?: { upiId: string; payee: string };
  canPurchase: boolean;
  /** a quotation being billed: opens in a fresh bill tab */
  prefill?: { quoteId: string; lines: CartLine[]; customer: string; phone: string };
};

/**
 * The billing counter. Several bills open at once (hold one, serve the next); each tab's half-made bill is kept in this
 * browser, so a refresh or power cut loses nothing. Keyboard first: a barcode scanner types the code and Enter.
 */
export function Counter(props: CounterProps) {
  const [tabs, setTabs] = useState<number[]>([1]);
  const [cur, setCur] = useState(1);
  // saving waits for the stored tabs to load: saving the initial [1] first would forget the bills already open
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = read<number[]>("rx_pos_tabs", [1]); setTabs(t.length ? t : [1]); setCur(t[0] ?? 1); setLoaded(true); }, []);
  useEffect(() => { if (loaded) save("rx_pos_tabs", tabs); }, [tabs, loaded]);
  const router = useRouter();
  // lets the counter reload while offline (public/sw.js); harmless where service workers aren't available
  useEffect(() => { void navigator.serviceWorker?.register("/sw.js").catch(() => {}); }, []);
  const [waiting, setWaiting] = useState(0);
  const [stuck, setStuck] = useState(0);
  const sending = useRef(false);
  const sync = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      let q = queued();
      while (q.length) {
        let r;
        try { r = await saveBill(q[0]); } catch { break; } // still offline (or the server is down): try again later
        // the server answered. A refusal (say, stock module switched off) is parked, never retried forever
        if (failed(r)) save("rx_pos_failed", [...read<unknown[]>("rx_pos_failed", []), { bill: q[0], error: r.__error }]);
        q = q.slice(1);
        save(QUEUE, q);
      }
      if (q.length !== waiting) router.refresh();
      setWaiting(q.length);
      setStuck(read<unknown[]>("rx_pos_failed", []).length);
    } finally { sending.current = false; }
  };
  useEffect(() => {
    const go = () => { setWaiting(queued().length); void sync(); };
    go();
    addEventListener("online", go);
    addEventListener("rx-queue", go);
    const t = setInterval(() => { if (queued().length) void sync(); }, 30000);
    return () => { removeEventListener("online", go); removeEventListener("rx-queue", go); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const prefilled = useRef(false);
  useEffect(() => {
    const p = props.prefill;
    if (!loaded || !p || prefilled.current) return;
    prefilled.current = true;
    const n = Math.max(0, ...tabs) + 1; // a fresh tab after every bill already open
    save(`rx_pos_bill_${n}`, { ...blank(), customer: p.customer, phone: p.phone, quoteId: p.quoteId, lines: p.lines.map((l) => ({ ...l, key: key() })) });
    setTabs([...tabs, n]);
    setCur(n);
    router.replace("/pos"); // so a refresh doesn't open the quote a second time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  const add = () => { const n = Math.max(0, ...tabs) + 1; setTabs([...tabs, n]); setCur(n); };
  const close = (n: number) => {
    const rest = tabs.filter((t) => t !== n);
    if (!rest.length) return;
    try { localStorage.removeItem(`rx_pos_bill_${n}`); } catch { /* ignore */ }
    setTabs(rest);
    if (cur === n) setCur(rest[rest.length - 1]);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "n") { e.preventDefault(); add(); }
      if (/^[1-9]$/.test(e.key) && tabs[+e.key - 1]) { e.preventDefault(); setCur(tabs[+e.key - 1]); }
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });
  return (
    <div className="mt-4">
      {waiting || stuck ? (
        <p role="status" className="mb-3 rounded-sm border border-rule-strong bg-panel px-3 py-2 text-[0.8rem] text-ink-soft">
          {waiting ? `${waiting} bill${waiting > 1 ? "s" : ""} waiting to be sent from this device. ` : ""}
          {stuck ? `${stuck} bill${stuck > 1 ? "s were" : " was"} refused by the server and kept in this browser (rx_pos_failed). ` : ""}
          {waiting ? <button type="button" className="font-semibold text-accent" onClick={() => void sync()}>Send now</button> : null}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-1 border-b border-rule" role="tablist" aria-label="Open bills">
        {tabs.map((n, i) => (
          <span key={n} className={`flex items-center rounded-t-sm border border-b-0 text-[0.8rem] ${n === cur ? "border-rule bg-surface font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
            <button role="tab" aria-selected={n === cur} onClick={() => setCur(n)} className="px-3 py-1.5" title={i < 9 ? `Alt+${i + 1}` : undefined}>Bill {n}</button>
            {tabs.length > 1 ? <button onClick={() => close(n)} className="pr-2 text-ink-faint hover:text-bad" aria-label={`Close bill ${n}`}><X className="size-3.5" /></button> : null}
          </span>
        ))}
        <button onClick={add} className={`${btnQuiet} mb-0.5`} title="New bill (Alt+N)"><Plus className="size-3.5" /> Hold &amp; new bill</button>
      </div>
      {tabs.map((n) => <div key={n} hidden={n !== cur}><BillPane tab={n} active={n === cur} {...props} /></div>)}
    </div>
  );
}

function BillPane({ tab, active, items, customers, dues, fmt, upi, canPurchase, offers = [], limits = {}, receipt = "80mm", today = new Date().toISOString().slice(0, 10), tcsRate = 0, hasPin = false }: CounterProps & { tab: number; active: boolean }) {
  const store = `rx_pos_bill_${tab}`;
  const [bill, setBill] = useState<Bill>(blank);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setBill({ ...blank(), ...read<Partial<Bill>>(store, {}) }); setLoaded(true); }, [store]);
  useEffect(() => { if (loaded) save(store, bill); }, [bill, loaded, store]);
  const set = (p: Partial<Bill>) => setBill((b) => ({ ...b, ...p }));

  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [msg, setMsg] = useState<{ ok?: string; error?: string; id?: string }>({});
  const [pending, start] = useTransition();
  const [qr, setQr] = useState<string | null>(null);
  const [showProfit, setShowProfit] = useState(false);
  const [pin, setPin] = useState("");
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const m = (v: number) => money(v, fmt);

  useEffect(() => { if (active) search.current?.focus(); }, [active]);

  const stock = useMemo(() => new Map(items.map((r) => [r.id, Number(r.data.on_hand ?? 0)])), [items]);
  const { qty: wantQty, q: term } = parseQty(q);
  const hits = useMemo(() => findItems(items, term, 8, today), [items, term, today]);
  const phone10 = bill.phone.replace(/\D/g, "").slice(-10);
  const known = phone10.length === 10 ? customers.find((c) => c.phone.replace(/\D/g, "").slice(-10) === phone10) : undefined;
  const balance = bill.kind === "sale" ? known?.points ?? 0 : 0;
  // offers only on sales; a coupon that doesn't apply shows why and is left out of the total
  const offered = useMemo((): Applied & { error?: string } => {
    const plain: Applied = { lines: bill.lines, discount: bill.discount, typed: 0, combo: 0, coupon: 0, combos: [] };
    if (bill.kind !== "sale") return plain;
    try { return applyOffers(bill.lines, bill.discount, offers, items, today, bill.coupon ?? ""); }
    catch (e) { try { return { ...applyOffers(bill.lines, bill.discount, offers, items, today), error: (e as Error).message }; } catch { return plain; } }
  }, [bill.lines, bill.discount, bill.kind, bill.coupon, offers, items, today]);
  const pts = discountWithPoints(offered.lines, offered.discount, Math.min(balance, parseFloat(bill.redeem ?? "") || 0));
  const priced = priceBill(offered.lines, pts.discount);
  const limitNote = bill.kind === "sale" && bill.lines.length ? cashierCheck(offered.lines, offered.typed, items, limits) : "";
  const profit = billProfit(priced.lines);
  const tcs = bill.kind === "sale" && bill.tcs && tcsRate ? r2((priced.total * tcsRate) / 100) : 0;
  const toPay = r2(priced.total + tcs);
  const gst = r2(priced.lines.reduce((s, l) => s + l.amount - l.amount / (1 + (l.gst ?? 0) / 100), 0));
  const received = parseFloat(bill.received) || 0;
  const change = bill.mode === "Cash" && received ? r2(received - toPay) : 0;
  const due = phone10.length === 10 ? dues[phone10] ?? 0 : 0;
  const isSale = bill.kind === "sale" || bill.kind === "return";
  const over = bill.mode === "Credit" && bill.kind === "sale" ? overLimit(due, toPay, known?.limit ?? 0) : 0;

  const addItem = (it: RecordRow, qty = 1) => {
    if (bill.kind === "sale" && isExpired(it, today)) { setQ(""); return setMsg({ error: `${String(it.data.name)}${it.data.batch ? ` (batch ${it.data.batch})` : ""} expired on ${it.data.expiry}. Take it off the shelf; it can't be sold.` }); }
    const last = known?.rates?.[String(it.data.name ?? "").trim().toLowerCase()];
    setBill((b) => {
      const i = b.lines.findIndex((l) => l.itemId === it.id);
      if (i >= 0) return { ...b, lines: b.lines.map((l, j) => (j === i ? requantify(l, r2(l.qty + qty), b.kind) : l)) };
      return { ...b, lines: [...b.lines, { ...toLine(it, qty, b.kind, b.kind === "sale" ? last : undefined), key: key() }] };
    });
    setQ(""); setHi(0); setMsg({});
    search.current?.focus();
  };
  const addOneOff = () => {
    if (!term) return;
    setBill((b) => ({ ...b, lines: [...b.lines, { key: key(), name: term, qty: wantQty, rate: 0 }] }));
    setQ("");
    // the price box of the new line, so the amount can be typed straight away
    requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>("tbody tr:last-child input[data-rate]")?.focus());
  };
  // a quantity change re-prices a line still at its list rate (wholesale from a minimum qty); a rate typed by hand stays
  const requantify = <L extends CartLine>(l: L, qty: number, kind: BillKind): L => {
    const it = l.itemId ? items.find((r) => r.id === l.itemId) : undefined;
    return it && l.rate === autoRate(it, l.qty, kind) ? { ...l, qty, rate: autoRate(it, qty, kind) } : { ...l, qty };
  };
  const upd = (k: string, p: Partial<CartLine>) => setBill((b) => ({ ...b, lines: b.lines.map((l) => (l.key !== k ? l : p.qty != null ? requantify({ ...l, ...p, qty: l.qty }, p.qty, b.kind) : { ...l, ...p })) }));
  const loadInvoice = () => {
    const no = (bill.against ?? "").trim();
    if (!no) return setMsg({ error: "Type the invoice number on the customer's bill." });
    start(async () => {
      const r = await invoiceLines(no);
      if (failed(r)) return setMsg({ error: r.__error });
      setBill((b) => ({ ...b, customer: r.customer, phone: r.phone, lines: r.lines.map((l) => ({ ...l, key: key() })) }));
      setMsg({ ok: `Loaded what can still come back from ${no}. Remove what the customer is keeping.` });
    });
  };
  const drop = (k: string) => setBill((b) => ({ ...b, lines: b.lines.filter((l) => l.key !== k) }));
  // a sale or return is priced at the selling price, a stock-in at cost: switching re-prices lines from the stock list
  const setKind = (kind: BillKind) => setBill((b) => ({
    ...b, kind, mode: (kind === "purchase" || kind === "preturn") && b.mode === "Card" ? "Cash" : b.mode, against: kind === "return" ? b.against : undefined,
    lines: b.lines.map((l) => { const it = items.find((r) => r.id === l.itemId); return it ? { ...l, rate: toLine(it, l.qty, kind).rate } : l; }),
  }));

  // UPI: a QR for the exact amount, so the customer scans and pays without typing
  const upiUrl = upi && bill.mode === "UPI" && isSale && bill.kind === "sale" && toPay > 0 ? upiLink({ upiId: upi.upiId, payee: upi.payee, amount: toPay, note: "Counter bill" }) : null;
  useEffect(() => {
    let live = true;
    if (!upiUrl) { setQr(null); return; }
    import("qrcode").then((Q) => Q.toDataURL(upiUrl, { margin: 1, width: 180 })).then((d) => { if (live) setQr(d); }, () => setQr(null));
    return () => { live = false; };
  }, [upiUrl]);

  const submit = (print: boolean) => {
    if (!bill.lines.length) return setMsg({ error: "Scan or search an item first." });
    if (bill.lines.some((l) => !(l.qty > 0))) return setMsg({ error: "Every line needs a quantity above zero." });
    if (bill.mode === "Cash" && bill.kind === "sale" && received && received < toPay) return setMsg({ error: `Received ${m(received)} is less than the bill. Take ${m(toPay - received)} more, or bill the rest on Credit.` });
    if (offered.error) return setMsg({ error: offered.error });
    if (limitNote && !pin) return setMsg({ error: hasPin ? `${limitNote} Or have the owner type their PIN.` : limitNote });
    if (over) return setMsg({ error: `Over ${known?.name ?? "the customer"}'s credit limit of ${m(known?.limit ?? 0)} by ${m(over)} (owes ${m(due)}). Take part payment, or raise the limit in Customers.` });
    // opened now, inside the click, so the browser doesn't block it as a pop-up; it is pointed at the receipt once saved
    const win = print ? window.open("about:blank", "_blank") : null;
    start(async () => {
      const input: BillInput = {
        kind: bill.kind, lines: bill.lines.map(({ key: _k, ...l }) => l), discount: bill.discount, redeem: pts.used || undefined, mode: bill.mode,
        customer: bill.customer || known?.name, phone: bill.phone, gstin: bill.gstin, clientId: newId(), quoteId: bill.quoteId,
        coupon: bill.kind === "sale" ? bill.coupon : undefined, against: bill.kind === "return" ? bill.against : undefined,
        tcs: bill.kind === "sale" && !!bill.tcs, pin: limitNote && pin ? pin : undefined,
      };
      let r;
      try { r = await saveBill(input); }
      catch (e) {
        if (!offline(e)) throw e;
        win?.close();
        save(QUEUE, [...queued(), input]);
        dispatchEvent(new Event("rx-queue"));
        setMsg({ ok: "No connection. The bill is kept on this device and goes through when you are back online." });
        setBill((b) => ({ ...blank(), kind: b.kind }));
        return search.current?.focus();
      }
      if (failed(r)) { win?.close(); return setMsg({ error: r.__error }); }
      if (win) win.location.href = !isSale ? "/m/purchases" : `/invoice/${r.id}?size=${receipt}&print=1`;
      setPin("");
      setMsg({ ok: `${{ sale: "Bill", return: "Return", purchase: "Stock in", preturn: "Debit note" }[bill.kind]} ${r.no} saved · ${m(r.total)}${change > 0 ? ` · give back ${m(change)}` : ""}`, id: !isSale ? undefined : r.id });
      setBill((b) => ({ ...blank(), kind: b.kind }));
      router.refresh(); // stock on hand and customer dues
      search.current?.focus();
    });
  };

  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      const f = (sel: string) => { e.preventDefault(); const el = root.current?.querySelector<HTMLInputElement>(sel); el?.focus(); el?.select(); };
      if (e.key === "F2") f("[data-search]");
      else if (e.key === "F3") f("[data-phone]");
      else if (e.key === "F4") f("[data-received]");
      else if (e.key === "F6") f("[data-discount]");
      else if (e.key === "F7") { e.preventDefault(); set({ mode: MODES[(MODES.indexOf(bill.mode) + 1) % MODES.length] }); }
      else if (e.key === "F9") { e.preventDefault(); submit(true); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(false); }
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });

  return (
    <div ref={root} className="grid gap-5 pt-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label="Items on this bill" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Bill type" value={bill.kind} onChange={setKind}
            options={[{ value: "sale", label: "Sale" }, { value: "return", label: "Return" },
              ...(canPurchase ? [{ value: "purchase" as const, label: "Stock in" }, { value: "preturn" as const, label: "Supplier return" }] : [])]} />
          <p className="text-[0.72rem] text-ink-faint">F2 search · 3*milk for 3 · F9 save &amp; print · Ctrl+Enter save</p>
        </div>

        {bill.kind === "purchase" ? (
          <div className="mt-3"><ScanBill items={items} onDone={(r) => setBill((b) => ({
            ...b, customer: b.customer || r.supplier, gstin: b.gstin || r.gstin,
            lines: [...b.lines, ...r.lines.map((l) => ({ ...l, key: key() }))],
          }))} /></div>
        ) : null}
        {bill.kind === "return" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input aria-label="Against invoice" placeholder="Against invoice no. (optional)" className={`${control} w-56`} value={bill.against ?? ""}
              onChange={(e) => set({ against: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); loadInvoice(); } }} />
            <button type="button" className={btnGhost} disabled={pending} onClick={loadInvoice}>Load bill</button>
            <span className="text-[0.72rem] text-ink-faint">With an invoice, a return can&apos;t be more than was sold on it.</span>
          </div>
        ) : null}
        <div className="relative mt-3">
          <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input ref={search} data-search value={q} aria-label="Scan a barcode or search an item" autoComplete="off"
            placeholder="Scan a barcode, or type an item name or SKU"
            className={`${control} w-full py-2.5 pl-8 pr-24 text-[0.95rem]`}
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Escape") setQ("");
              else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (hits[hi]) addItem(hits[hi], wantQty); else addOneOff(); }
            }} />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-1">
            <VoiceInput onText={(t) => { setQ(t); setHi(0); search.current?.focus(); }} />
            <CameraScan onCode={(code) => { const hit = findItems(items, code)[0]; if (hit) addItem(hit); else { setQ(code); setHi(0); } }} />
          </div>
          {term ? (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-sm border border-rule bg-surface shadow-overlay" role="listbox">
              {hits.map((it, i) => {
                const left = stock.get(it.id) ?? 0;
                return (
                  <li key={it.id} role="option" aria-selected={i === hi} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); addItem(it, wantQty); }}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[0.84rem] ${i === hi ? "bg-accent-wash" : ""}`}>
                    <span className="min-w-0 truncate"><span className="font-medium text-ink">{String(it.data.name)}</span>
                      <span className="ml-2 text-[0.72rem] text-ink-faint">{[it.data.sku, it.data.barcode].filter(Boolean).join(" · ")}</span></span>
                    <span className="shrink-0 tabular-nums text-ink-soft">{m(toLine(it, 1, bill.kind).rate)}
                      <span className={`ml-2 text-[0.72rem] ${left <= 0 ? "text-bad" : "text-ink-faint"}`}>{left} left</span></span>
                  </li>
                );
              })}
              <li onMouseDown={(e) => { e.preventDefault(); addOneOff(); }}
                className={`cursor-pointer border-t border-rule px-3 py-2 text-[0.8rem] text-ink-soft hover:bg-panel ${!hits.length ? "bg-accent-wash" : ""}`}>
                {hits.length ? "Or add" : "Not in your stock list. Add"} “{term}” as a one-off line{wantQty !== 1 ? ` × ${wantQty}` : ""} (type its price)
              </li>
            </ul>
          ) : null}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[0.84rem]">
            <thead>
              <tr className="border-b border-rule text-left text-[0.66rem] uppercase tracking-[0.1em] text-ink-faint">
                <th className="py-2 font-semibold">Item</th><th className="w-20 font-semibold">Qty</th><th className="w-28 font-semibold">{isSale ? "Price" : "Cost"}</th>
                <th className="w-16 font-semibold">Disc %</th><th className="w-28 text-right font-semibold">Amount</th><th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {priced.lines.map((l, i) => {
                const left = l.itemId ? stock.get(l.itemId) ?? 0 : null;
                const short = bill.kind === "sale" && left != null && l.qty > left;
                const k = bill.lines[i].key;
                const it = l.itemId ? items.find((r) => r.id === l.itemId) : undefined;
                const offerPct = (offered.lines[i] as { offerPct?: number }).offerPct;
                return (
                  <tr key={k} className="border-b border-rule/70 align-top">
                    <td className="py-2 pr-2">
                      <span className="font-medium text-ink">{l.name}</span>
                      {left != null ? <span className={`block text-[0.7rem] ${short ? "text-bad" : "text-ink-faint"}`}>{short ? `Only ${left} in stock` : `${left} in stock`}{l.gst ? ` · GST ${l.gst}%` : ""}{it?.data.batch ? ` · batch ${it.data.batch}` : ""}{it?.data.expiry ? ` · exp ${it.data.expiry}` : ""}</span> : <span className="block text-[0.7rem] text-ink-faint">One-off line, no stock kept</span>}
                      {offerPct ? <span className="block text-[0.7rem] font-medium text-good">Near-expiry offer {offerPct}% off</span> : null}
                      {it && bill.kind === "sale" && Number(it.data.wholesale_min) > 0 && Number(it.data.wholesale_price) > 0 ? <span className="block text-[0.7rem] text-ink-faint">Wholesale {m(Number(it.data.wholesale_price))} from {Number(it.data.wholesale_min)}</span> : null}
                      {it?.data.track_serial === true && isSale ? <input aria-label={`${l.name} serial or IMEI`} placeholder="Serial / IMEI" className={`${control} mt-1 w-full py-1 text-[0.76rem]`} value={bill.lines[i].serial ?? ""} onChange={(e) => upd(k, { serial: e.target.value })} /> : null}
                    </td>
                    <td className="py-1.5 pr-2"><input aria-label={`${l.name} quantity`} inputMode="decimal" className={`${control} w-full text-right tabular-nums`} value={String(bill.lines[i].qty)}
                      onChange={(e) => upd(k, { qty: parseFloat(e.target.value) || 0 })} /></td>
                    <td className="py-1.5 pr-2"><input data-rate aria-label={`${l.name} price`} inputMode="decimal" className={`${control} w-full text-right tabular-nums`} value={String(bill.lines[i].rate)}
                      onChange={(e) => upd(k, { rate: parseFloat(e.target.value) || 0 })} /></td>
                    <td className="py-1.5 pr-2"><input aria-label={`${l.name} discount percent`} inputMode="decimal" className={`${control} w-full text-right tabular-nums`} value={bill.lines[i].disc ? String(bill.lines[i].disc) : ""}
                      onChange={(e) => upd(k, { disc: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} /></td>
                    <td className="py-2 text-right tabular-nums text-ink">{m(l.amount)}</td>
                    <td className="py-1.5 text-right"><button className={btnQuiet} onClick={() => drop(k)} aria-label={`Remove ${l.name}`}><Trash2 className="size-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!bill.lines.length ? <p className="py-10 text-center text-[0.84rem] text-ink-faint">Scan or search to add the first item.</p> : null}
        </div>
      </section>

      <aside aria-label="Customer and payment" className="flex flex-col gap-4 lg:border-l lg:border-rule lg:pl-5">
        <div className="grid gap-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">{isSale ? "Customer" : "Supplier"} <span className="font-normal normal-case tracking-normal text-ink-faint">· optional, F3</span></p>
          {isSale ? <input data-phone inputMode="tel" aria-label="Customer phone" placeholder="Phone" className={control} value={bill.phone} onChange={(e) => set({ phone: e.target.value })} /> : null}
          <input aria-label={isSale ? "Customer name" : "Supplier name"} placeholder={known ? known.name : "Name"} className={control} value={bill.customer} onChange={(e) => set({ customer: e.target.value })} />
          <input aria-label="GSTIN" placeholder="GSTIN (for a B2B tax invoice)" className={control} value={bill.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} />
          {known ? <p className="text-[0.74rem] text-ink-soft">Regular customer: {known.name}{balance > 0 ? <> · {balance} points</> : null}{due > 0 ? <> · <span className="text-bad">owes {m(due)}</span></> : null}</p>
            : phone10.length === 10 && isSale ? <p className="text-[0.74rem] text-ink-faint">New customer: they&apos;re added to Customers when you save.</p> : null}
        </div>

        <dl className="grid gap-1 border-y border-rule py-3 text-[0.84rem]">
          <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{m(priced.subtotal)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-ink-soft">Bill discount <span className="text-[0.7rem] text-ink-faint">F6</span></dt>
            <dd><input data-discount aria-label="Bill discount, amount or percent" placeholder="50 or 10%" className={`${control} w-24 text-right tabular-nums`} value={bill.discount} onChange={(e) => set({ discount: e.target.value })} /></dd></div>
          {balance > 0 ? <div className="flex items-center justify-between gap-3"><dt className="text-ink-soft">Use points <span className="text-[0.7rem] text-ink-faint">{balance} = {m(balance)}</span></dt>
            <dd><input inputMode="numeric" aria-label="Loyalty points to use" placeholder="0" className={`${control} w-24 text-right tabular-nums`} value={bill.redeem ?? ""} onChange={(e) => set({ redeem: e.target.value })} /></dd></div> : null}
          {bill.kind === "sale" ? <div className="flex items-center justify-between gap-3"><dt className="text-ink-soft">Coupon</dt>
            <dd><input aria-label="Coupon code" placeholder="CODE" className={`${control} w-24 text-right uppercase`} value={bill.coupon ?? ""} onChange={(e) => set({ coupon: e.target.value.toUpperCase() })} /></dd></div> : null}
          {offered.error ? <p className="text-[0.74rem] text-bad">{offered.error}</p> : null}
          {offered.combos.map((c) => <div key={c.name} className="flex justify-between text-[0.78rem] text-good"><dt>{c.name}{c.sets > 1 ? ` × ${c.sets}` : ""}</dt><dd className="tabular-nums">−{m(c.saving)}</dd></div>)}
          {offered.coupon ? <div className="flex justify-between text-[0.78rem] text-good"><dt>Coupon {offered.couponCode}</dt><dd className="tabular-nums">−{m(offered.coupon)}</dd></div> : null}
          {priced.discount ? <div className="flex justify-between text-ink-soft"><dt>Discount</dt><dd className="tabular-nums">−{m(priced.discount)}</dd></div> : null}
          {gst ? <div className="flex justify-between text-[0.76rem] text-ink-faint"><dt>GST included</dt><dd className="tabular-nums">{m(gst)}</dd></div> : null}
          <div className="mt-1 flex items-baseline justify-between"><dt className="font-semibold text-ink">{bill.kind === "return" ? "Refund" : "Total"}</dt>
            <dd className="text-[1.6rem] font-semibold tabular-nums tracking-[-0.02em] text-ink">{m(priced.total)}</dd></div>
          {bill.kind === "sale" && bill.lines.length ? (showProfit
            ? <button type="button" onClick={() => setShowProfit(false)} className="flex justify-between text-left text-[0.76rem] text-ink-soft" aria-label="Hide profit">
                <span>Profit{profit.known ? "" : " (some costs missing)"}</span><span className={`tabular-nums ${profit.profit < 0 ? "text-bad" : ""}`}>{m(profit.profit)} · {profit.pct}%</span></button>
            : <button type="button" onClick={() => setShowProfit(true)} className="text-left text-[0.74rem] text-ink-faint underline-offset-2 hover:underline">Check profit</button>) : null}
          {tcs ? <div className="flex justify-between text-[0.78rem] text-ink-soft"><dt>TCS @ {tcsRate}%</dt><dd className="tabular-nums">+{m(tcs)}</dd></div> : null}
          {tcs ? <div className="flex justify-between font-semibold"><dt>To collect</dt><dd className="tabular-nums">{m(toPay)}</dd></div> : null}
          {bill.kind === "sale" && tcsRate ? <label className="flex items-center gap-2 text-[0.76rem] text-ink-soft"><input type="checkbox" className="size-3.5 accent-[var(--color-accent)]" checked={!!bill.tcs} onChange={(e) => set({ tcs: e.target.checked })} /> Collect TCS ({tcsRate}%)</label> : null}
          {limitNote ? <p role="alert" className="text-[0.74rem] text-bad">{limitNote}</p> : null}
          {limitNote && hasPin ? <input type="password" inputMode="numeric" autoComplete="off" aria-label="Owner PIN" placeholder="Owner PIN to allow it" className={`${control} text-[0.8rem]`} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} /> : null}
        </dl>

        <div className="grid gap-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">{bill.kind === "return" ? "Refunded by" : "Paid by"} <span className="font-normal normal-case tracking-normal text-ink-faint">· F7 to switch</span></p>
          <Segmented label="Payment mode" value={bill.mode} onChange={(mode) => set({ mode })} options={MODES.map((x) => ({ value: x, label: x }))} />
          {bill.mode === "Cash" && bill.kind === "sale" ? (
            <>
              <input data-received inputMode="decimal" aria-label="Cash received" placeholder="Cash received (F4)" className={`${control} text-right tabular-nums`} value={bill.received} onChange={(e) => set({ received: e.target.value })} />
              <div className="flex flex-wrap gap-1">
                {[toPay, ...tenders(toPay)].filter((x) => x > 0).map((x) => (
                  <button key={x} type="button" className={`${btnGhost} px-2 py-1 text-[0.76rem]`} onClick={() => set({ received: String(x) })}>{x === toPay ? "Exact" : m(x)}</button>
                ))}
              </div>
              {change > 0 ? <p className="text-[0.95rem] font-semibold text-good">Give back {m(change)}</p> : null}
            </>
          ) : null}
          {over ? <p role="alert" className="text-[0.76rem] font-semibold text-bad">Over credit limit by {m(over)}. This bill can&apos;t be saved on credit.</p> : null}
          {bill.mode === "Credit" ? <p className="text-[0.74rem] text-ink-soft">Saved as unpaid against the customer{known?.terms ? `, due in ${known.terms} days` : ", due today"}. Payment reminders and Unpaid sales pick it up.</p> : null}
          {upiUrl ? (qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <figure className="self-center text-center"><img src={qr} alt={`UPI QR to pay ${m(toPay)}`} width={160} height={160} /><figcaption className="text-[0.72rem] text-ink-faint">Customer scans to pay {m(toPay)}</figcaption></figure>
          ) : null) : bill.mode === "UPI" && !upi ? <p className="text-[0.74rem] text-ink-faint">Add your UPI ID in Settings to show a pay-by-QR here.</p> : null}
        </div>

        <div className="grid gap-2">
          <button className={`${btnPrimary} py-2.5`} disabled={pending} onClick={() => submit(true)}><Printer className="size-4" /> {pending ? "Saving…" : `Save & print${!isSale ? "" : " receipt"}`} <span className="text-[0.7rem] opacity-75">F9</span></button>
          <button className={btnGhost} disabled={pending} onClick={() => submit(false)}>Save only <span className="text-[0.7rem] opacity-75">Ctrl+Enter</span></button>
          {bill.lines.length ? <button className={btnQuiet} disabled={pending} onClick={() => { if (confirm("Clear this bill?")) setBill((b) => ({ ...blank(), kind: b.kind })); }}>Clear bill</button> : null}
        </div>
        <div aria-live="polite" className="text-[0.8rem]">
          {msg.error ? <p className="text-bad">{msg.error}</p> : null}
          {msg.ok ? <p className="text-good">{msg.ok}{msg.id ? <> · <Link className="underline" href={`/invoice/${msg.id}`} target="_blank">invoice</Link></> : null}</p> : null}
        </div>
      </aside>
    </div>
  );
}
