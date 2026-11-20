import { autoOrders, AUTO_BY } from "@/lib/autoorder";
import { audit, getBusiness, insertRecords, updateBusiness } from "@/lib/db";
import { log } from "@/lib/automation";
import { todayIso } from "@/lib/metrics";
import { notifyUsers } from "@/lib/notify";
import { uid, type RecordRow } from "@/lib/model";

/**
 * Places the day's autopilot restock orders for one business (see src/lib/autoorder.ts for the guardrails) and tells
 * the owner. Safe to call any number of times a day: open orders and the weekly cap stop it from repeating itself.
 */
export async function runAutoOrder(businessId: string): Promise<number> {
  const b = await getBusiness(businessId, { records: true });
  const cfg = b?.autoOrder;
  if (!b || !cfg?.enabled || !b.modules.some((m) => m.id === "purchases" && m.enabled) || !b.modules.some((m) => m.id === "inventory" && m.enabled)) return 0;
  const r = autoOrders(b, cfg, todayIso());
  if (!r.place.length) return 0;
  const rows: RecordRow[] = r.place.map((data) => ({ id: uid("r_"), at: new Date().toISOString(), by: AUTO_BY, data: data as RecordRow["data"] }));
  await insertRecords(b.id, "purchases", rows);
  const text = `Autopilot ordered ${rows.length} item${rows.length > 1 ? "s" : ""} (${r.spent} of this week's ${cfg.weeklyCap} cap): ${r.place.map((p) => `${p.item} × ${p.quantity} from ${p.supplier}`).join("; ")}.`;
  await updateBusiness(b.id, (x) => log(x, text, "automation", "/m/purchases"));
  await audit(b.id, { actor: AUTO_BY, action: "create", entity: "purchases", summary: text, after: r.place });
  await notifyUsers(b.id, (u) => u.roleId === "owner", "Autopilot placed orders", text, "/m/purchases");
  return rows.length;
}
