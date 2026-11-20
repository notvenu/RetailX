import Link from "next/link";
import { requireArea } from "@/lib/session";
import { LabelSheet } from "@/components/LabelSheet";
import { PackLabels } from "@/components/PackLabels";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Barcode labels · RetailX" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { business: b } = await requireArea("inventory");
  const f = b.features ?? {};
  const packs = !!(f.nutrition || f.certificates);
  const kind = packs && (await searchParams).kind === "pack" ? "pack" : "barcode";
  const rows = b.records.inventory ?? [];
  const s = (v: unknown) => String(v ?? "");
  const tab = (k: string, label: string) => (
    <Link href={k === "pack" ? "/labels?kind=pack" : "/labels"} aria-current={kind === k ? "page" : undefined}
      className={`rounded-full border px-3 py-1 text-[0.78rem] ${kind === k ? "border-accent bg-accent-wash text-accent" : "border-rule-strong text-ink-soft hover:text-ink"}`}>{label}</Link>
  );
  return (
    <>
      <PageHeader title="Labels" meta={kind === "pack" ? "Pack labels with nutrition, ingredients and certificates, from your stock list." : "Shelf and product labels from your stock list. Any USB barcode scanner reads them at the counter."} />
      {packs ? <nav aria-label="Label type" className="mt-4 flex gap-1.5 print:hidden">{tab("barcode", "Barcode labels")}{tab("pack", "Pack labels")}</nav> : null}
      {!rows.length ? <div className="mt-6"><Empty title="No stock items yet">Add items in Stock (with a barcode or SKU), then print their labels here.</Empty></div>
        : kind === "pack" ? (
          <PackLabels shop={b.name} fmt={{ currency: b.currency, locale: b.locale }} nutrition={!!f.nutrition} certificates={!!f.certificates}
            items={rows.map((r) => ({
              id: r.id, name: s(r.data.name), price: Number(r.data.price) || 0, mrp: Number(r.data.mrp) || 0, batch: s(r.data.batch), expiry: s(r.data.expiry),
              ingredients: s(r.data.ingredients), nutrition: s(r.data.nutrition), serving: s(r.data.serving), veg: s(r.data.veg), allergens: s(r.data.allergens),
              howTo: s(r.data.how_to_use), fssai: s(r.data.fssai), certificate: /^https?:\/\//.test(s(r.data.certificate)) ? s(r.data.certificate) : "",
              certBy: s(r.data.certificate_by), certUntil: s(r.data.certificate_until),
            }))} />
        ) : (
          <LabelSheet fmt={{ currency: b.currency, locale: b.locale }} shop={b.name} items={rows.map((r) => ({
            id: r.id, name: s(r.data.name), code: String(r.data.barcode || r.data.sku || ""), price: Number(r.data.price) || 0,
            onHand: Number(r.data.on_hand) || 0, category: s(r.data.category),
          }))} />
        )}
    </>
  );
}
