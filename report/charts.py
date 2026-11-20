"""Figures for the RetailX report: architecture, data flow, ER diagram and result charts from ml/models/*.json."""
import json, pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

ROOT = pathlib.Path(r"d:\Coding\Projects\RetailX")
OUT = pathlib.Path(__file__).parent / "fig"
OUT.mkdir(exist_ok=True)
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
INK, ACC, SOFT, WASH = "#1f2937", "#3538cd", "#6b7280", "#eef0ff"


def box(ax, x, y, w, h, title, lines=(), fill="white", edge=INK):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08", fc=fill, ec=edge, lw=1.2))
    ax.text(x + w / 2, y + h - 0.22, title, ha="center", va="top", fontsize=10, fontweight="bold", color=INK)
    for i, l in enumerate(lines):
        ax.text(x + w / 2, y + h - 0.55 - i * 0.27, l, ha="center", va="top", fontsize=8.2, color=SOFT)


def arrow(ax, x1, y1, x2, y2, label=""):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="-|>", color=INK, lw=1))
    if label:
        ax.text((x1 + x2) / 2 + 0.05, (y1 + y2) / 2, label, fontsize=7.5, color=SOFT, ha="left", va="center")


# ---- 1. architecture
fig, ax = plt.subplots(figsize=(10, 6.6)); ax.set_xlim(0, 10); ax.set_ylim(0, 6.8); ax.axis("off")
box(ax, 0.2, 5.3, 9.6, 1.3, "Presentation layer (Next.js App Router, React, Tailwind)",
    ["Public site · Sign-up & onboarding · Dashboard · Counter (POS) · Records · Insights",
     "Forecasting · Analytics · Reports (GST) · AI team · Automations · Approvals · Settings"], fill=WASH)
box(ax, 0.2, 3.25, 3.0, 1.75, "Application layer", ["Server actions (actions.ts)", "Role & view-only checks (session.ts)", "Auth.js sessions", "Audit log on every change"])
box(ax, 3.5, 3.25, 3.0, 1.75, "Intelligence layer", ["Forecast engine: 10 models + auto", "Stock & cash planning", "Insights, what-if, anomalies", "Restock autopilot (guardrails)"])
box(ax, 6.8, 3.25, 3.0, 1.75, "Automation & AI layer", ["Rules on save / schedule / KPI", "AI roles (Claude) + rule fallback", "Scheduler: /api/cron", "WhatsApp · e-mail · web push"])
box(ax, 0.2, 1.2, 4.6, 1.7, "Data layer (libSQL / SQLite or Turso)", ["users · businesses · records · audit", "tokens · attempts · outbox · push_subs · kv"])
box(ax, 5.2, 1.2, 4.6, 1.7, "Offline ML pipeline (Python)", ["LightGBM on Favorita, M5, Rossmann, TFI", "Forecast-to-decision experiment (ml/f2d.ts)", "metrics.json → reported results"])
box(ax, 0.2, 0.05, 9.6, 0.85, "Browser on the shop counter", ["Service worker keeps /pos usable offline · bills queue on the device and sync once"], fill="#f8fafc")
for x in (1.7, 5.0, 8.3): arrow(ax, x, 5.3, x, 5.0)
arrow(ax, 1.7, 3.25, 1.7, 2.9); arrow(ax, 5.0, 3.25, 3.6, 2.9); arrow(ax, 8.3, 3.25, 4.4, 2.9)
arrow(ax, 7.5, 2.9, 6.0, 3.25, "")
fig.savefig(OUT / "architecture.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# ---- 2. data flow: transaction to decision
fig, ax = plt.subplots(figsize=(10, 3.2)); ax.set_xlim(0, 10); ax.set_ylim(0, 3.2); ax.axis("off")
steps = [("Record", ["Counter bill, purchase,", "expense, day close"]), ("Store", ["records table,", "audit entry"]),
         ("Measure", ["KPIs, GST, dues,", "stock on hand"]), ("Forecast", ["10 models, rolling-", "origin back-test"]),
         ("Decide", ["safety stock, order", "qty, what-if"]), ("Act", ["order / remind /", "task / autopilot"])]
for i, (t, l) in enumerate(steps):
    x = 0.1 + i * 1.65
    box(ax, x, 0.9, 1.45, 1.5, t, l, fill=WASH if t in ("Forecast", "Decide") else "white")
    if i: arrow(ax, x - 0.2, 1.65, x, 1.65)
ax.annotate("", xy=(0.85, 0.85), xytext=(9.1, 0.85), arrowprops=dict(arrowstyle="-|>", color=ACC, lw=1, connectionstyle="arc3,rad=0.25"))
ax.text(5, 0.2, "outcomes (stock-outs, sales, dues collected) are recorded and feed the next forecast", ha="center", fontsize=8, color=ACC)
fig.savefig(OUT / "dataflow.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# ---- 3. ER diagram
fig, ax = plt.subplots(figsize=(10, 5.4)); ax.set_xlim(0, 10); ax.set_ylim(0, 5.6); ax.axis("off")
ents = {
    "businesses": (3.6, 3.3, ["id (PK)", "doc: modules, KPIs, roles,", "automations, autoOrder, theme", "updated_at"]),
    "users": (0.2, 3.3, ["id (PK)", "business_id (FK)", "email / phone / username", "hash, role_id, prefs"]),
    "records": (7.0, 3.3, ["id (PK)", "business_id (FK)", "module (sales, stock…)", "data (JSON), deleted_at"]),
    "audit": (7.0, 0.4, ["id (PK)", "business_id (FK)", "actor, action, entity", "before / after"]),
    "outbox": (3.6, 0.4, ["id (PK)", "business_id (FK)", "channel, recipient", "body, sent"]),
    "tokens · push_subs": (0.2, 0.4, ["token / endpoint (PK)", "user_id (FK)", "kind, expires_at", "sub"]),
}
for n, (x, y, l) in ents.items():
    box(ax, x, y, 2.8, 1.85, n, l)
arrow(ax, 3.0, 4.2, 3.6, 4.2, "1:N"); arrow(ax, 6.4, 4.2, 7.0, 4.2, "1:N"); arrow(ax, 5.8, 3.3, 7.6, 2.25, "1:N")
arrow(ax, 5.0, 3.3, 5.0, 2.25, "1:N"); arrow(ax, 1.6, 3.3, 1.6, 2.25, "1:N")
ax.text(5, 5.45, "kv (k, v): settings and idempotency keys for offline bills  ·  attempts: sign-in rate limiting", ha="center", fontsize=8, color=SOFT)
fig.savefig(OUT / "er.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# ---- 4. benchmark: LightGBM vs baseline
m = json.loads((ROOT / "ml/models/metrics.json").read_text())
labels = ["Favorita\n(WAPE)", "M5 Walmart\n(WAPE)", "Rossmann\n(RMSPE)", "TFI sites\n(RMSE log)"]
model = [m["demand_favorita"]["wape"], m["demand_m5"]["wape"], m["branch"]["rmspe"], m["site"]["tfi_restaurants"]["cv_rmse_log"]]
base = [m["demand_favorita"]["wape_baseline_lag28"], m["demand_m5"]["wape_baseline_lag28"], m["branch"]["rmspe_baseline_store_dow_median"], m["site"]["tfi_restaurants"]["cv_rmse_log_baseline_mean"]]
fig, ax = plt.subplots(figsize=(8, 3.6)); xs = range(len(labels)); w = 0.36
ax.bar([x - w / 2 for x in xs], base, w, label="Simple baseline", color="#cbd5e1")
ax.bar([x + w / 2 for x in xs], model, w, label="LightGBM", color=ACC)
for x, (b, v) in enumerate(zip(base, model)):
    ax.text(x - w / 2, b + 0.01, f"{b:.3f}", ha="center", fontsize=8); ax.text(x + w / 2, v + 0.01, f"{v:.3f}", ha="center", fontsize=8)
ax.set_xticks(list(xs), labels); ax.set_ylabel("Error (lower is better)"); ax.legend(frameon=False)
fig.savefig(OUT / "benchmark.png", dpi=200, bbox_inches="tight"); plt.close(fig)

OFF = {"hw_add": (6, -11), "hw_mul": (6, 4), "naive": (-34, 6), "drift": (6, -10), "ses": (-120, 5), "holt": (6, -10)}
# ---- 5. forecast-to-decision: accuracy vs cost
f = json.loads((ROOT / "ml/models/f2d.json").read_text())
fig, ax = plt.subplots(figsize=(8, 4.6))
for s in f["summary"]:
    c = ACC if s["key"] == "auto" else INK
    ax.scatter(s["wape"] * 100, s["cost"], color=c, s=36, zorder=3)
    ax.annotate(s["name"].replace(" (best back-test MAE, as in RetailX)", " (RetailX)"), (s["wape"] * 100, s["cost"]), xytext=OFF.get(s["key"], (5, 3)), textcoords="offset points", fontsize=7.5, color=c)
ax.set_xlabel("Forecast error, WAPE (%)"); ax.set_ylabel("Inventory cost per day\n(in days of average demand)")
ax.grid(alpha=0.25)
fig.savefig(OUT / "f2d_scatter.png", dpi=200, bbox_inches="tight"); plt.close(fig)

# ---- 6. fill rate vs stock held
fig, ax = plt.subplots(figsize=(8, 4.2))
for s in f["summary"]:
    c = ACC if s["key"] == "auto" else INK
    ax.scatter(s["coverDays"], s["fill"] * 100, color=c, s=36, zorder=3)
    ax.annotate(s["name"].replace(" (best back-test MAE, as in RetailX)", " (RetailX)"), (s["coverDays"], s["fill"] * 100), xytext=(5, 3) if s["key"] not in ("hw_add", "ses") else (5, -10), textcoords="offset points", fontsize=7.5, color=c)
ax.set_xlabel("Average stock held (days of average demand)"); ax.set_ylabel("Fill rate (%)"); ax.grid(alpha=0.25)
fig.savefig(OUT / "f2d_fill.png", dpi=200, bbox_inches="tight"); plt.close(fig)
print("ok", sorted(p.name for p in OUT.glob("*.png")))
