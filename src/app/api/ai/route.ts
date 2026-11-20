import { revalidatePath } from "next/cache";
import { askRole, postToThread, workTask } from "@/lib/ai";
import { actionCtx } from "@/lib/session";

/**
 * Streams an AI role's reply as newline-delimited JSON: {t:"text",d} deltas, {t:"status",s} while it uses a tool,
 * then {t:"done",actions}. Body: {roleId, prompt} to chat, or {taskId} to have the assigned role work on a task.
 */
export async function POST(req: Request) {
  let ctx;
  try { ctx = await actionCtx("ai"); } catch (e) { return new Response((e as Error).message, { status: 403 }); }
  const body = (await req.json().catch(() => ({}))) as { roleId?: string; prompt?: string; taskId?: string };
  const prompt = String(body.prompt ?? "").trim().slice(0, 4000);
  const role = ctx.business.aiRoles.find((r) => r.id === body.roleId && r.enabled);
  if (!body.taskId && (!role || !prompt)) return new Response("Pick a role and write a message.", { status: 400 });

  const enc = new TextEncoder();
  const { user, business } = ctx;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: object) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const hooks = { onText: (d: string) => send({ t: "text", d }), onStatus: (s: string) => send({ t: "status", s }) };
      try {
        if (body.taskId) {
          const reply = await workTask(business.id, body.taskId, hooks);
          send({ t: "done", actions: reply.actions });
        } else {
          const history = (business.threads[role!.id] ?? []).map((m) => ({ role: m.role, text: m.text }));
          const reply = await askRole(business.id, role!.id, prompt, history, hooks);
          const at = new Date().toISOString();
          await postToThread(business.id, role!.id, [
            { role: "user", text: prompt, at, by: user.name },
            { role: "assistant", text: reply.text + (reply.actions.length ? `\n\n**Done:** ${reply.actions.join("; ")}` : ""), at },
          ]);
          send({ t: "done", actions: reply.actions });
        }
      } catch (e) {
        send({ t: "error", m: (e as Error).message });
      } finally {
        revalidatePath("/", "layout");
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
