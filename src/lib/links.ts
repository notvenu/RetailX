/** One-tap links. Pure, so client screens can build them too. */

/** Digits with country code; bare 10-digit numbers are taken as Indian (+91). */
export function intlPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? "91" + d : d;
}

export const waLink = (phone: string, text: string) => `https://wa.me/${intlPhone(phone)}?text=${encodeURIComponent(text)}`;

/** UPI deep link: opens any UPI app with payee, amount and note filled in. */
export function upiLink(o: { upiId: string; payee: string; amount?: number; note?: string }) {
  const p = new URLSearchParams({ pa: o.upiId, pn: o.payee, cu: "INR" });
  if (o.amount) p.set("am", o.amount.toFixed(2));
  if (o.note) p.set("tn", o.note.slice(0, 50));
  return `upi://pay?${p.toString()}`;
}
