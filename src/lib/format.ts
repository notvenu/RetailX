import type { Unit } from "@/lib/model";

export type Fmt = { currency: string; locale: string };

const cache = new Map<string, Intl.NumberFormat>();
const nf = (locale: string, o: Intl.NumberFormatOptions) => {
  const key = locale + JSON.stringify(o);
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(locale, o));
  return cache.get(key)!;
};

export const money = (n: number, f: Fmt) =>
  nf(f.locale, { style: "currency", currency: f.currency, maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 }).format(n);

/** ₹1.24 Cr / ₹8.60 L for INR, $12.4K elsewhere: compact for dense tiles. */
export function moneyCompact(n: number, f: Fmt): string {
  if (f.currency === "INR") {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
    return `${sign}₹${abs.toFixed(0)}`;
  }
  return nf(f.locale, { style: "currency", currency: f.currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export const num = (n: number, f?: Fmt) => nf(f?.locale ?? "en-IN", { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 0 }).format(n);
export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

export function fmtUnit(n: number | null | undefined, unit: Unit, f: Fmt, compact = false): string {
  if (n == null || !Number.isFinite(n)) return "—";
  switch (unit) {
    case "money": return compact ? moneyCompact(n, f) : money(n, f);
    case "pct": return pct(n);
    case "days": return `${n.toFixed(1)} d`;
    case "ratio": return `${n.toFixed(2)}×`;
    default: return num(n, f);
  }
}

/** direction of a delta relative to what's "good"; higher-is-better by default */
export function tone(delta: number, higherIsBetter = true): "good" | "bad" | "flat" {
  if (Math.abs(delta) < 0.05) return "flat";
  return delta > 0 === higherIsBetter ? "good" : "bad";
}

export const dateShort = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T00:00" : iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

export const ago = (iso: string) => {
  const s = (Date.now() - +new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return dateShort(iso);
};
