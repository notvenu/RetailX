"""Read Nandan Provisions' books and publish what the app shows.

  ml/data/monthly_closes.csv   one closing line per month, Oct 2025 - Sep 2026
  ml/data/store_daily.csv      September 2026, day by day
  ml/data/sku_daily.csv        tracked products, September 2026 (authored by ml/data/make_sku_daily.py)
  ml/data/category_month.csv   September revenue mix by category

  revenue   - monthly revenue, Holt's damped trend, rolling-origin back-test -> Forecasting
  anomalies - each day against the same weekday this month, robust z-score   -> Analytics / Overview
  demand    - next 16 days per product from weekday averages + safety stock -> Inventory
  ledger    - P&L, expense mix, KPI series, balances, category mix          -> Finance / KPIs

Writes src/data/ml.json (read by src/lib/mock.ts) and the "retailx" block of ml/models/metrics.json.
"""
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

ML = Path(__file__).parent
DATA = ML / "data"
OUT = ML / "models"
APP_JSON = ML.parent / "src" / "data" / "ml.json"
STORE = "Baner Road"  # mirrors BRANCHES in src/lib/mock.ts
OPEX = {"rent": "Rent", "payroll": "Payroll and benefits", "utilities": "Electricity and water",
        "marketing": "Marketing", "other_opex": "Other operating"}
Z90 = Z95 = 1.645  # 90% two-sided interval; 95% one-sided service level
# ponytail: balance-sheet constants not in the closes yet; move them there when the ledger keeps them
FIT_OUT_WDV = 1_350_000   # shop fit-out and equipment, written-down value
RENT_DEPOSIT = 990_000    # six months' rent held by the landlord


def load():
    closes = pd.read_csv(DATA / "monthly_closes.csv")
    closes["opex"] = closes[list(OPEX)].sum(axis=1)
    daily = pd.read_csv(DATA / "store_daily.csv", parse_dates=["date"])
    daily["festival"] = daily.festival.fillna("")
    daily["cogs"] = (daily.revenue * (1 - daily.gross_margin_pct / 100)).round()
    sep = closes.iloc[-1]
    assert sep.month == daily.date.dt.strftime("%Y-%m").iloc[0], "last close is not the detailed month"
    assert (sep.revenue, sep.cogs, sep.bills) == (daily.revenue.sum(), daily.cogs.sum(), daily.bills.sum()), \
        "monthly_closes.csv September row must equal the store_daily.csv totals"
    return closes, daily


# ---------------------------------------------------------------- revenue forecast
def holt(y):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # statsmodels convergence chatter on short series
        return ExponentialSmoothing(y, trend="add", damped_trend=True).fit()


def revenue_forecast(closes, folds=6, horizon=4):
    y = pd.Series(closes.revenue.astype(float).values, index=pd.PeriodIndex(closes.month, freq="M"))
    # rolling origin: refit on everything before month k, score month k only
    back = pd.Series({y.index[k]: holt(y.values[:k]).forecast(1)[0] for k in range(len(y) - folds, len(y))})
    act = y.loc[back.index]
    err = (back - act) / act
    rel_sd = float(np.sqrt(np.mean(err ** 2)))
    future = holt(y.values).forecast(horizon)
    fut_idx = pd.period_range(y.index[-1] + 1, periods=horizon, freq="M")
    band = lambda p, h: (round(p * (1 - Z90 * rel_sd * np.sqrt(h))), round(p * (1 + Z90 * rel_sd * np.sqrt(h))))
    points = [{"x": m.strftime("%b"), "actual": int(act[m]), "predicted": round(back[m]),
               "lower": band(back[m], 1)[0], "upper": band(back[m], 1)[1]} for m in back.index]
    points += [{"x": m.strftime("%b"), "actual": None, "predicted": round(p),
                "lower": band(p, h)[0], "upper": band(p, h)[1]} for h, (m, p) in enumerate(zip(fut_idx, future), 1)]
    model = {"name": "Holt's linear trend, damped",
             "target": f"Monthly revenue, {STORE} store", "trainedOn": f"{len(y)} months",
             "validation": f"Rolling-origin, {folds} folds",
             "mape": round(float(err.abs().mean() * 100), 1),
             "rmse": round(float(np.sqrt(np.mean((back - act) ** 2)))),
             "mae": round(float((back - act).abs().mean())),
             "bias": round(float(err.mean() * 100), 1),
             "limits": "Twelve months is too short to learn the yearly festival pattern, so Diwali (8 Nov 2026) is not in this forecast."}
    return points, model


# ---------------------------------------------------------------- anomalies
# column: (label, log-ratio?, direction that is bad, z threshold, unit)
METRICS = {
    "revenue": ("Revenue", True, -1, 4, "inr"),
    "gross_margin_pct": ("Gross margin", False, -1, 4, "pct"),
    "avg_discount_pct": ("Avg. discount", False, 1, 4, "pct"),
    "footfall": ("Footfall", True, -1, 5, "count"),
    "shrinkage_inr": ("Shrinkage", True, 1, 5, "inr"),
    "stockout_rate_pct": ("Stock-out rate", False, 1, 5, "pct"),
}


def fmt(v, unit):
    return {"inr": f"₹{v:,.0f}", "pct": f"{v:.1f}%", "count": f"{v:,.0f}"}[unit]


def detect_anomalies(daily):
    """Expected value = median of the same weekday on the month's other ordinary days.
    Festival days are meant to be unusual: they are never flagged and never used as a baseline."""
    ordinary = daily[daily.festival == ""]
    rows, per, flagged_days = [], {}, set()
    for col, (label, logr, sign, Z, unit) in METRICS.items():
        exp = pd.Series(np.nan, index=daily.index)
        for i, d in ordinary.iterrows():
            peers = ordinary[(ordinary.weekday == d.weekday) & (ordinary.index != i)][col]
            if len(peers) >= 2:
                exp[i] = peers.median()
        r = np.log(daily[col] / exp) if logr else daily[col] - exp
        med = r.median()
        mad = (r - med).abs().median() * 1.4826
        z = sign * (r - med) / mad
        flag = z > Z
        per[col] = {"z_threshold": Z, "flagged": int(flag.sum())}
        for i in daily.index[flag]:
            a, e = daily.at[i, col], exp[i]
            dev = f"{(a / e - 1) * 100:+.1f}%" if unit != "pct" else f"{a - e:+.1f} pts"
            flagged_days.add(daily.at[i, "date"])
            rows.append({"metric": label, "branch": STORE, "date": daily.at[i, "date"].strftime("%d %b %Y").lstrip("0"),
                         "_date": daily.at[i, "date"], "actual": fmt(a, unit), "expected": fmt(e, unit),
                         "deviation": dev.replace("-", "−"),
                         "severity": "High" if z[i] >= 1.4 * Z else "Medium" if z[i] >= 1.15 * Z else "Low",
                         "status": "Open", "z": round(float(z[i]), 1),
                         "cause": daily.at[i, "note"] if isinstance(daily.at[i, "note"], str) else ""})
    incidents = set(ordinary[ordinary.note.notna()].date)  # what the store logged in its day book
    report = {"metrics": per, "flagged_days": len(flagged_days), "logged_incidents": len(incidents),
              "caught": len(incidents & flagged_days), "false_flags": len(flagged_days - incidents)}
    rows.sort(key=lambda r: (r["_date"], r["z"]), reverse=True)
    return [{k: v for k, v in r.items() if k != "_date"} for r in rows], report


# ---------------------------------------------------------------- product demand
def weekday_rates(hist):
    return hist.groupby("weekday").demand_units.mean(), hist.demand_units.mean()


def product_demand(horizon=16):
    """Demand (units sold + sales lost to empty shelves) per weekday on ordinary days, projected over the
    next `horizon` days, plus safety stock covering 95% of outcomes."""
    s = pd.read_csv(DATA / "sku_daily.csv", parse_dates=["date"])
    s["weekday"] = s.date.dt.dayofweek
    ordinary = s[s.festival.isna()]
    last = s.date.max()
    ahead = pd.date_range(last + pd.Timedelta(days=1), periods=horizon).dayofweek

    # back-test: the last ordinary days of September, predicted from the weeks before them
    cut = last - pd.Timedelta(days=9)
    test = ordinary[ordinary.date > cut]
    err = base_err = total = 0.0
    for k, t in test.groupby("sku"):
        by_wd, overall = weekday_rates(ordinary[(ordinary.sku == k) & (ordinary.date <= cut)])
        pred = t.weekday.map(by_wd).fillna(overall)
        demand = s[s.sku == k].set_index("date").demand_units
        week_ago = t.date.map(lambda d: demand.get(d - pd.Timedelta(days=7), overall))
        err += (t.demand_units - pred).abs().sum()
        base_err += (t.demand_units - week_ago).abs().sum()
        total += t.demand_units.sum()
    metrics = {"method": "weekday average of ordinary days + 95% safety stock", "horizonDays": horizon,
               "backtestDays": int(test.date.nunique()), "wapePct": round(err / total * 100, 1),
               "baselinePct": round(base_err / total * 100, 1), "baseline": "same weekday a week earlier"}

    products = []
    for k, g in s.groupby("sku", sort=False):
        mine = ordinary[ordinary.sku == k]
        by_wd, overall = weekday_rates(mine)
        forecast = float(sum(by_wd.get(w, overall) for w in ahead))
        safety = Z95 * mine.demand_units.std() * np.sqrt(horizon)  # daily errors assumed independent
        end = g[g.date == last].iloc[0]
        products.append({
            "sku": k, "name": end["name"], "category": end.category, "price": int(end.price),
            "onHand": int(end.closing_stock), "reorder": int(end.reorder_point),
            "units30d": int(g.units_sold.sum()), "lost30d": int(g.lost_units.sum()),
            "revenue30d": int(g.revenue.sum()),
            "marginPct": round(float((1 - g.cogs.sum() / g.revenue.sum()) * 100), 1),
            "forecast16d": int(round(forecast)),
            "suggestedOrder": int(max(0, np.ceil(forecast + safety - end.closing_stock))),
        })
    return products, metrics


# ---------------------------------------------------------------- ledger
def ledger(closes, daily):
    months = pd.PeriodIndex(closes.month, freq="M")
    days = months.days_in_month.values
    cur = closes.iloc[-1]
    y, m = int(cur.month[:4]), int(cur.month[5:])
    fy = closes[closes.month >= f"{y if m >= 4 else y - 1}-04"]  # Indian financial year starts in April
    op = closes.revenue - closes.cogs - closes.opex
    capital = FIT_OUT_WDV + RENT_DEPOSIT + closes.inventory_cost + closes.receivables + closes.cash - closes.payables
    dio = closes.inventory_cost / (closes.cogs / days)
    r1 = lambda s: [round(float(v), 1) for v in s]
    cats = pd.read_csv(DATA / "category_month.csv")
    assert cats.share_pct.sum() == 100, "category shares must add to 100"
    return {
        "fyMonths": len(fy),
        "pnl": [{"month": p.strftime("%b"), "revenue": int(r.revenue), "cogs": int(r.cogs), "opex": int(r.opex),
                 "otherIncome": int(r.other_income)} for p, (_, r) in zip(months, closes.iterrows())],
        "expenses": [{"category": label, "month": int(cur[c]), "ytd": int(fy[c].sum()),
                      "share": round(float(cur[c] / cur.opex * 100), 1)} for c, label in OPEX.items()],
        "categoryMonth": [{"category": c.category, "revenue": int(round(cur.revenue * c.share_pct / 100)),
                           "grossMarginPct": float(c.gross_margin_pct)} for c in cats.itertuples()],
        "kpis": {
            "revenueTarget": [int(v) for v in closes.sales_target],
            "salesTargetPct": r1(closes.revenue / closes.sales_target * 100),
            "avgBill": [round(float(v)) for v in closes.revenue / closes.bills],
            "stockoutPct": r1(closes.stockout_rate_pct),
            "invTurnover": r1(closes.cogs * 12 / closes.inventory_cost),
            "dio": [round(float(v)) for v in dio],
            "ccc": [round(float(v)) for v in dio + closes.receivables / (closes.revenue / days)
                    - closes.payables / (closes.cogs / days)],
            "roce": r1(op.rolling(3, min_periods=1).mean() * 12 / capital * 100),
            "revPerEmployee": [round(float(v)) for v in closes.revenue / closes.headcount],
        },
        "balances": {"cash": int(cur.cash), "receivables": int(cur.receivables), "payables": int(cur.payables),
                     "inventory": int(cur.inventory_cost), "headcount": int(cur.headcount)},
        "breakEvenPct": round(float(cur.revenue / (cur.opex / (1 - cur.cogs / cur.revenue)) * 100), 1),
        "month": {"days": int(len(daily)), "bills": int(daily.bills.sum()), "footfall": int(daily.footfall.sum())},
    }


if __name__ == "__main__":
    closes, daily = load()
    points, fmodel = revenue_forecast(closes)
    anomalies, anomaly_report = detect_anomalies(daily)
    products, demand_metrics = product_demand()
    book = ledger(closes, daily)
    metrics = {"revenue_forecast": fmodel, "anomalies": anomaly_report, "product_demand": demand_metrics}
    print(json.dumps(metrics, indent=2, ensure_ascii=False))

    APP_JSON.parent.mkdir(parents=True, exist_ok=True)
    APP_JSON.write_text(json.dumps({"revenueForecast": points, "forecastModel": fmodel, "anomalies": anomalies[:8],
                                    "ledger": book, "products": products},
                                   indent=2, ensure_ascii=False), encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    mpath = OUT / "metrics.json"
    allm = json.loads(mpath.read_text(encoding="utf-8")) if mpath.exists() else {}
    allm["retailx"] = metrics
    mpath.write_text(json.dumps(allm, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {APP_JSON}")
