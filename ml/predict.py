"""Run a model on inputs a user typed into the app. Called by src/app/api/predict/route.ts.

  stdin  {"kind": "revenue" | "demand" | "day" | "anomaly", ...inputs}
  stdout the prediction as JSON; {"error": "..."} with exit code 2 when the inputs are unusable

  revenue - refit Holt's damped trend (retailx.revenue_forecast) on the monthly revenue the user gives
  demand  - one product's next N days from its September day book (retailx.demand_plan), any service level
  day     - one day's sales: same-weekday baseline from the day book x promo / school-holiday effect from
            the Rossmann LightGBM models (ml/models/branch.joblib, trained by train.py)
  anomaly - score a day's figures against September's same-weekday medians (retailx.metric_scale)

python ml/predict.py --check   runs one of each.
"""
import json
import sys
from statistics import NormalDist

import numpy as np
import pandas as pd

import retailx as rx


class BadInput(Exception):
    pass


def num(v, name, lo=None, hi=None):
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise BadInput(f"{name} must be a number.")
    if not np.isfinite(x) or (lo is not None and x < lo) or (hi is not None and x > hi):
        raise BadInput(f"{name} must be at least {lo:g}." if hi is None else f"{name} must be between {lo:g} and {hi:g}.")
    return x


def day_book():
    d = pd.read_csv(rx.DATA / "store_daily.csv", parse_dates=["date"])
    d["festival"] = d.festival.fillna("")
    return d


# ---------------------------------------------------------------- kinds
def revenue(q):
    vals = [num(v, "Monthly revenue", 1) for v in q.get("revenue", [])]
    if not 7 <= len(vals) <= 60:
        raise BadInput("Give between 7 and 60 months of revenue.")
    horizon = int(num(q.get("horizon", 4), "Horizon", 1, 12))
    end = pd.Period(q.get("end", "2026-09"), freq="M")
    months = pd.period_range(end=end, periods=len(vals), freq="M").strftime("%Y-%m")
    points, model = rx.revenue_forecast(pd.DataFrame({"month": months, "revenue": vals}),
                                        folds=min(6, len(vals) - 6), horizon=horizon)
    model["trainedOn"] = f"{len(vals)} months"
    model["limits"] = "Holt's trend has no seasonal term, so festival peaks (Diwali, 8 Nov 2026) are not in this forecast."
    return {"points": points, "model": model}


def demand(q):
    s = pd.read_csv(rx.DATA / "sku_daily.csv", parse_dates=["date"])
    g = s[s.sku == q.get("sku")]
    if g.empty:
        raise BadInput("Unknown SKU.")
    horizon = int(num(q.get("horizon", 16), "Days ahead", 1, 60))
    service = num(q.get("service", 95), "Service level", 50, 99.9)
    uplift = num(q.get("uplift", 0), "Expected uplift", -90, 500) / 100
    last = g.date.max()
    on_hand = num(q.get("onHand", g[g.date == last].closing_stock.iloc[0]), "On hand", 0)
    mine = g[g.festival.isna()].assign(weekday=lambda d: d.date.dt.dayofweek)
    ahead = pd.date_range(last + pd.Timedelta(days=1), periods=horizon)
    forecast, safety = rx.demand_plan(mine, ahead.dayofweek, NormalDist().inv_cdf(service / 100))
    forecast *= 1 + uplift
    per_day = forecast / horizon
    return {"sku": q["sku"], "name": g.name.iloc[0], "from": ahead[0].strftime("%d %b"), "to": ahead[-1].strftime("%d %b"),
            "forecast": round(forecast), "safety": round(safety), "onHand": round(on_hand),
            "order": int(max(0, np.ceil(forecast + safety - on_hand))),
            "daysCover": round(on_hand / per_day, 1) if per_day > 0 else None,
            "method": f"Weekday average of {mine.date.nunique()} ordinary September days, {service:g}% service level"}


ROSSMANN_CATS = {"StateHoliday": ["0", "a", "b", "c"], "StoreType": ["a", "b", "c", "d"], "Assortment": ["a", "b", "c"]}


def day(q):
    import joblib
    date = pd.Timestamp(q.get("date") or "2026-10-01")
    promo, school = int(bool(q.get("promo"))), int(bool(q.get("school")))
    b = joblib.load(rx.OUT / "branch.joblib")

    def X(p, s):  # a median Rossmann store on this date; only the ratio between two calls is used
        x = pd.DataFrame([{"level_y": b["level_y"].median(), "level_c": b["level_c"].median(), "dow": date.dayofweek + 1,
                           "day": date.day, "month": date.month, "week": int(date.isocalendar().week),
                           "year": 2015,  # ponytail: last training year; trees can't extrapolate past it anyway
                           "Promo": p, "StateHoliday": "0", "SchoolHoliday": s, "StoreType": "a",
                           "Assortment": "a", "CompetitionDistance": 2330.0, "Promo2": 0}])
        for c, v in ROSSMANN_CATS.items():
            x[c] = pd.Categorical(x[c], categories=v)
        return x[b["features"]]

    sales_fx = float(np.exp(b["sales_model"].predict(X(promo, school))[0] - b["sales_model"].predict(X(0, 0))[0]))
    cust_fx = float(np.exp(b["customers_model"].predict(X(promo, school))[0] - b["customers_model"].predict(X(0, 0))[0]))

    d = day_book()
    peers = d[(d.festival == "") & (d.date.dt.dayofweek == date.dayofweek)]
    base_rev = num(q["baseRevenue"], "Usual revenue", 0) if q.get("baseRevenue") not in (None, "") else peers.revenue.median()
    base_ff = num(q["baseFootfall"], "Usual footfall", 0) if q.get("baseFootfall") not in (None, "") else peers.footfall.median()
    uplift = 1 + num(q.get("uplift", 0), "Festival uplift", -90, 500) / 100
    rev, ff = base_rev * sales_fx * uplift, base_ff * cust_fx * uplift
    err = json.loads((rx.OUT / "metrics.json").read_text(encoding="utf-8"))["branch"]["rmspe"]
    return {"date": date.strftime("%a %d %b %Y"), "revenue": round(rev), "footfall": round(ff),
            "avgTicket": round(rev / ff) if ff else None,
            "lower": round(rev * (1 - rx.Z90 * err)), "upper": round(rev * (1 + rx.Z90 * err)),
            "baseRevenue": round(base_rev), "salesEffect": round(sales_fx, 3), "footfallEffect": round(cust_fx, 3),
            "baseFrom": f"median of {len(peers)} ordinary {date.strftime('%A')}{'s' * (len(peers) != 1)} in September"}


def anomaly(q):
    d = day_book()
    date = pd.Timestamp(q.get("date") or "2026-10-01")
    wd = date.strftime("%a")
    ordinary = d[d.festival == ""]
    out = []
    for col, (label, logr, sign, Z, unit) in rx.METRICS.items():
        if q.get(col) in (None, ""):
            continue
        a = num(q[col], label, 0)
        _, _, med, mad = rx.metric_scale(d, col)
        e = ordinary[ordinary.weekday == wd][col].median()
        if logr and (a <= 0 or e <= 0):
            raise BadInput(f"{label} must be above zero.")
        r = np.log(a / e) if logr else a - e
        z = float(sign * (r - med) / mad)
        out.append({"metric": label, "actual": rx.fmt(a, unit), "expected": rx.fmt(e, unit),
                    "deviation": (f"{(a / e - 1) * 100:+.1f}%" if unit != "pct" else f"{a - e:+.1f} pts").replace("-", "−"),
                    "z": round(z, 1), "threshold": Z,
                    "verdict": "High" if z >= 1.4 * Z else "Medium" if z >= 1.15 * Z else "Low" if z > Z else "Normal"})
    if not out:
        raise BadInput("Enter at least one figure.")
    return {"date": date.strftime("%a %d %b %Y"), "rows": out}


KINDS = {"revenue": revenue, "demand": demand, "day": day, "anomaly": anomaly}


def run(q):
    if q.get("kind") not in KINDS:
        raise BadInput("Unknown prediction kind.")
    return KINDS[q["kind"]](q)


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        r = run({"kind": "revenue", "revenue": rx.load()[0].revenue.tolist(), "horizon": 4})
        assert len(r["points"]) == 10 and r["points"][-1]["actual"] is None, r
        assert run({"kind": "demand", "sku": "ST-ATTA-10"})["forecast"] > 0
        hi = run({"kind": "demand", "sku": "ST-ATTA-10", "service": 99})["safety"]
        assert hi > run({"kind": "demand", "sku": "ST-ATTA-10", "service": 90})["safety"]
        p = run({"kind": "day", "date": "2026-10-06", "promo": True})
        assert p["salesEffect"] > 1 and p["lower"] < p["revenue"] < p["upper"], p
        a = run({"kind": "anomaly", "date": "2026-10-06", "shrinkage_inr": 9000, "revenue": 98000})["rows"]
        assert [r["verdict"] for r in a] == ["Normal", "High"], a
        try:
            run({"kind": "revenue", "revenue": [1, 2]})
            raise AssertionError("short history accepted")
        except BadInput:
            pass
        print("predict.py ok")
        sys.exit()
    try:
        print(json.dumps(run(json.loads(sys.stdin.read() or "{}"))))
    except (BadInput, json.JSONDecodeError) as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(2)
