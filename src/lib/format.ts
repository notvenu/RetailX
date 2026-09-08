const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const INR2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NUM = new Intl.NumberFormat("en-IN");

export const money = (n: number) => INR.format(n);
export const money2 = (n: number) => INR2.format(n);
export const num = (n: number) => NUM.format(n);

/** ₹1.24 Cr / ₹8.60 L / ₹4,500 — compact Indian scale for dense tiles. */
export function moneyCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
export const pctSigned = (n: number, digits = 1) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}%`;

/** direction of a delta relative to what's "good"; higher-is-better by default */
export function tone(delta: number, higherIsBetter = true): "good" | "bad" | "flat" {
  if (Math.abs(delta) < 0.05) return "flat";
  const positive = delta > 0;
  return positive === higherIsBetter ? "good" : "bad";
}

export const MONTHS = [
  "Oct", "Nov", "Dec", "Jan", "Feb", "Mar",
  "Apr", "May", "Jun", "Jul", "Aug", "Sep",
];
