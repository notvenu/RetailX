import { spawn } from "node:child_process";
import path from "node:path";
import { auth } from "@/auth";
import { canAccess } from "@/lib/access";
import type { Role } from "@/lib/users";

export const runtime = "nodejs";

// which page's access rule each prediction follows (proxy.ts skips /api, so check here)
const PAGE: Record<string, string> = {
  revenue: "/forecasting",
  day: "/forecasting",
  demand: "/inventory",
  anomaly: "/analytics",
};

// ponytail: one Python process per request (~2s cold import); keep a warm worker if this gets busy
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.text();
  if (body.length > 20_000) return Response.json({ error: "Input too large." }, { status: 413 });
  let kind: unknown;
  try {
    kind = JSON.parse(body).kind;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const page = PAGE[String(kind)];
  if (!page) return Response.json({ error: "Unknown prediction kind." }, { status: 400 });
  if (!canAccess(session.user.role as Role, page)) {
    return Response.json({ error: "Your role can't run this model." }, { status: 403 });
  }

  const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      const p = spawn(process.env.PYTHON ?? "python", [path.join(process.cwd(), "ml", "predict.py")], {
        timeout: 60_000,
      });
      let stdout = "";
      let stderr = "";
      p.stdout.on("data", (d) => (stdout += d));
      p.stderr.on("data", (d) => (stderr += d));
      p.on("error", (e) => resolve({ code: -1, stdout, stderr: String(e) }));
      p.on("close", (code) => resolve({ code, stdout, stderr }));
      p.stdin.end(body);
    },
  );

  if (code === 0 || code === 2) {
    return new Response(stdout, {
      status: code === 0 ? 200 : 400,
      headers: { "content-type": "application/json" },
    });
  }
  console.error("ml/predict.py failed", code, stderr.slice(-2000));
  return Response.json(
    { error: "The model could not run. Check that Python and ml/ requirements are installed." },
    { status: 500 },
  );
}
