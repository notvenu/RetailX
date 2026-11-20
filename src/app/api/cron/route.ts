import { dailyBriefings } from "@/lib/ai";
import { deliver, runDue, type Outgoing } from "@/lib/automation";
import { runAutoOrder } from "@/lib/autorun";
import { listBusinessIds, purgeDeleted, updateBusiness } from "@/lib/db";

/**
 * The clock: runs due schedules and KPI watches, morning briefings and bin clean-up for every business.
 * Call it every 15–60 minutes with `Authorization: Bearer $CRON_SECRET` (Vercel Cron, cron-job.org, or crontab + curl).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const report: Record<string, string> = {};
  for (const id of await listBusinessIds()) {
    try {
      const out: Outgoing[] = [];
      const ran = await updateBusiness(id, (b) => (b.onboarded ? runDue(b, out) : 0), { records: true });
      await deliver(id, out);
      const briefed = await dailyBriefings(id);
      const ordered = await runAutoOrder(id);
      await purgeDeleted(id);
      report[id] = `${ran} automations, ${briefed} briefings, ${ordered} autopilot orders`;
    } catch (e) {
      report[id] = `error: ${(e as Error).message}`;
    }
  }
  return Response.json(report);
}
