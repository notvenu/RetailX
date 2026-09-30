"""Train RetailX models on the public datasets fetched by download.py.

  demand_favorita - Favorita store x product-family daily units, 16-day horizon (LightGBM, tweedie)
  demand_m5       - M5 Walmart item x store daily units with price/SNAP/events, same horizon
  branch          - Rossmann branch daily sales + customers (LightGBM) and an anomaly detector on
                    sales / customers / avg-bill residuals
  site            - new-site revenue from TFI restaurant site features

Run all, or name some: python train.py branch demand_m5

Writes ml/models/<name>.joblib and ml/models/metrics.json.
"""
import json, os, sys
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import KFold, cross_val_predict

ML = Path(__file__).parent
RAW = Path(os.environ.get("RETAILX_RAW", ML / "raw"))
OUT = Path(os.environ.get("RETAILX_MODELS", ML / "models"))
QUIET = [lgb.log_evaluation(0)]


def wape(y, p):
    return float(np.abs(y - p).sum() / np.abs(y).sum())


def fit_gbm(X, y, Xv, yv, **kw):
    """Early-stop on the holdout, then refit on train+holdout at the best iteration."""
    params = dict(n_estimators=3000, learning_rate=0.05, num_leaves=63, subsample=0.8,
                  subsample_freq=1, colsample_bytree=0.8, verbose=-1, **kw)
    m = lgb.LGBMRegressor(**params).fit(X, y, eval_X=(Xv,), eval_y=(yv,),
                                        callbacks=[lgb.early_stopping(100, verbose=False)] + QUIET)
    pred = m.predict(Xv)
    final = lgb.LGBMRegressor(**{**params, "n_estimators": m.best_iteration_ or params["n_estimators"]})
    final.fit(pd.concat([X, Xv]), np.concatenate([y, yv]))
    return final, pred, m


# ---------------------------------------------------------------- demand
def demand_features(df, extra, lags=(16, 21, 28, 35, 364), H=16):
    """df: date, store, item, sales + `extra` columns, sorted by (store, item, date).
    Adds lag/calendar features that are all known H days ahead. Future rows (sales = NaN) get
    features from history, so the same call builds training data and forecast inputs."""
    keys = [df.store, df.item]
    g = df.groupby(keys, observed=True).sales
    for lag in lags:
        df[f"lag_{lag}"] = g.shift(lag).astype("float32")
    sg = g.shift(H).groupby(keys, observed=True)
    df["roll_7"] = sg.transform(lambda s: s.rolling(7).mean()).astype("float32")
    df["roll_28"] = sg.transform(lambda s: s.rolling(28).mean()).astype("float32")
    df["dow"], df["dom"], df["month"] = df.date.dt.dayofweek, df.date.dt.day, df.date.dt.month
    df = df.dropna(subset=[f"lag_{max(l for l in lags if l < 100)}"])
    return df, ["store", "item", "dow", "dom", "month", *extra, *(f"lag_{l}" for l in lags), "roll_7", "roll_28"]


def demand_model(df, name, extra, lags=(16, 21, 28, 35, 364), H=16):
    """Fits LightGBM on demand_features(), saves demand_<name>.joblib."""
    df, feats = demand_features(df, extra, lags, H)
    keys = [df.store, df.item]
    cut = df.date.max() - pd.Timedelta(days=H)
    tr, va = df[df.date <= cut], df[df.date > cut]
    model, pred, _ = fit_gbm(tr[feats], tr.sales.values, va[feats], va.sales.values,
                             objective="tweedie", tweedie_variance_power=1.2)
    pred = np.clip(pred, 0, None)
    resid_sd = (va.sales - pred).groupby([va.store, va.item], observed=True).std()  # daily, per series
    joblib.dump({"model": model, "features": feats, "extra": extra, "lags": lags, "horizon": H,
                 "resid_sd": resid_sd}, OUT / f"demand_{name}.joblib")
    return {"rows": len(df), "series": int(df.groupby(["store", "item"], observed=True).ngroups), "holdout_days": H,
            "wape": wape(va.sales.values, pred),
            "wape_baseline_lag28": wape(va.sales.values, va.lag_28.fillna(0).values),  # same weekday 4 weeks back
            "rmsle": float(np.sqrt(np.mean((np.log1p(pred) - np.log1p(va.sales.values)) ** 2)))}


def train_demand_favorita():
    """Favorita (Ecuador grocery): store x product family."""
    d = RAW / "store-sales"
    df = pd.read_csv(d / "train.csv", parse_dates=["date"], usecols=["date", "store_nbr", "family", "sales", "onpromotion"])
    hol = pd.read_csv(d / "holidays_events.csv", parse_dates=["date"])
    national = hol[(hol.locale == "National") & ~hol.transferred.astype(bool)].date
    df = df[df.date >= "2015-01-01"].rename(columns={"store_nbr": "store", "family": "item"})  # ponytail: 2.5y is plenty
    df = df.sort_values(["store", "item", "date"]).reset_index(drop=True)
    df["store"], df["item"] = df.store.astype("category"), df.item.astype("category")
    df["holiday"] = df.date.isin(national).astype("int8")
    return demand_model(df, "favorita", ["onpromotion", "holiday"])


def train_demand_m5(dept="FOODS_3", days=548):
    """M5 (Walmart): individual item x store, with price and SNAP/event calendar.
    ponytail: one grocery dept, last 1.5y (no lag_364) - full M5 is ~59M rows, needs >8 GB RAM."""
    d = RAW / "m5"
    cal = pd.read_csv(d / "calendar.csv", parse_dates=["date"])
    cols = cal.d.iloc[:1941].tolist()[-days:]  # evaluation file has d_1..d_1941
    cal = cal.set_index("d").loc[cols]
    w = pd.read_csv(d / "sales_train_evaluation.csv", usecols=["item_id", "dept_id", "store_id", *cols])
    w = w[w.dept_id == dept].reset_index(drop=True)
    n, T = len(w), len(cols)

    # prices: (series x day) array via the weekly price table
    p = pd.read_csv(d / "sell_prices.csv")
    p = p[p.item_id.str.startswith(dept)].pivot_table(index=["store_id", "item_id"], columns="wm_yr_wk", values="sell_price")
    price = p.reindex(pd.MultiIndex.from_arrays([w.store_id, w.item_id])).reindex(columns=cal.wm_yr_wk.values).to_numpy("float32")
    snap = cal[["snap_CA", "snap_TX", "snap_WI"]].to_numpy("int8")
    state = w.store_id.str[:2].map({"CA": 0, "TX": 1, "WI": 2}).to_numpy()

    df = pd.DataFrame({
        "store": pd.Categorical(np.repeat(w.store_id.values, T)),
        "item": pd.Categorical(np.repeat(w.item_id.values, T)),
        "date": np.tile(cal.date.values, n),
        "sales": w[cols].to_numpy("float32").ravel(),
        "price": price.ravel(),
        "price_rel": (price / np.nanmean(price, axis=1, keepdims=True)).ravel(),  # <1 = discounted
        "snap": snap[np.tile(np.arange(T), n), np.repeat(state, T)],
        "event": np.tile(cal.event_name_1.notna().to_numpy("int8"), n),
    })
    del w, p, price
    df = df[df.price.notna()].reset_index(drop=True)  # item not on shelf yet
    return demand_model(df, "m5", ["price", "price_rel", "snap", "event"], lags=(16, 21, 28, 35))


# ---------------------------------------------------------------- branch + anomaly
def rossmann():
    d = RAW / "rossmann"
    df = pd.read_csv(d / "train.csv", parse_dates=["Date"], dtype={"StateHoliday": str})
    stores = pd.read_csv(d / "store.csv")
    return df[(df.Open == 1) & (df.Sales > 0)].merge(stores, on="Store"), stores


def residual_scale(res, stores):
    """Per-store median and MAD of each residual series (robust to the odd bad day)."""
    out = {}
    for k, r in res.items():
        med = r.groupby(stores).median()
        out[k] = (med, (r - stores.map(med)).abs().groupby(stores).median() * 1.4826)
    return out


def anomaly_score(res, stores, scale):
    """Worst |robust z| across sales, customers and avg-bill residuals."""
    return np.max([((r - stores.map(scale[k][0])) / stores.map(scale[k][1])).abs() for k, r in res.items()], axis=0)


def train_branch():
    df, _ = rossmann()
    df["dow"], df["day"], df["month"] = df.DayOfWeek, df.Date.dt.day, df.Date.dt.month
    df["week"], df["year"] = df.Date.dt.isocalendar().week.astype(int), df.Date.dt.year
    for c in ("StateHoliday", "StoreType", "Assortment"):
        df[c] = df[c].astype("category")
    df["y"], df["c"] = np.log1p(df.Sales), np.log1p(df.Customers)

    cut = df.Date.max() - pd.Timedelta(days=42)  # 6-week horizon, as in the competition
    past = df.Date <= cut
    # store levels from training period only (no leakage)
    level_y, level_c = df[past].groupby("Store").y.mean(), df[past].groupby("Store").c.mean()
    df["level_y"], df["level_c"] = df.Store.map(level_y), df.Store.map(level_c)
    tr, va = df[past], df[~past]
    feats = ["level_y", "level_c", "dow", "day", "month", "week", "year", "Promo", "StateHoliday", "SchoolHoliday",
             "StoreType", "Assortment", "CompetitionDistance", "Promo2"]
    sales_model, pred, eval_sales = fit_gbm(tr[feats], tr.y.values, va[feats], va.y.values)
    cust_model, pred_c, eval_cust = fit_gbm(tr[feats], tr.c.values, va[feats], va.c.values)
    base = va.merge(tr.groupby(["Store", "dow"]).Sales.median().rename("b").reset_index(), on=["Store", "dow"]).b

    def rmspe(y, p):
        return float(np.sqrt(np.mean(((y - p) / y) ** 2)))

    def residuals(d, ms, mc, y, c):
        rs, rc = pd.Series(y - ms.predict(d[feats]), d.index), pd.Series(c - mc.predict(d[feats]), d.index)
        return {"sales": rs, "customers": rc, "bill": rs - rc}

    # anomaly check: corrupt 2% of holdout days by +/-20-50%. Half are traffic anomalies (customers move
    # with sales), half are ticket anomalies (sales only, e.g. till/pricing errors). Scale comes from the
    # last year of training residuals, as it would in production.
    Z = 5.0  # picked on this check: ~0.25 false alarms per store per month
    rng = np.random.default_rng(0)
    n = len(va)
    hit = rng.random(n) < 0.02
    f = np.where(hit, np.where(rng.random(n) < 0.5, rng.uniform(0.5, 0.8, n), rng.uniform(1.2, 1.5, n)), 1)
    traffic = rng.random(n) < 0.5
    recent = tr[tr.Date > cut - pd.Timedelta(days=365)]
    scale = residual_scale(residuals(recent, eval_sales, eval_cust, recent.y.values, recent.c.values), recent.Store)
    res_va = residuals(va, eval_sales, eval_cust, np.log1p(va.Sales.values * f),
                       np.log1p(va.Customers.values * np.where(traffic, f, 1)))
    flag = anomaly_score(res_va, va.Store, scale) > Z
    tp = (flag & hit).sum()

    # production scale: final models, last year of all data
    last = df[df.Date > df.Date.max() - pd.Timedelta(days=365)]
    prod_scale = residual_scale(residuals(last, sales_model, cust_model, last.y.values, last.c.values), last.Store)
    joblib.dump({"sales_model": sales_model, "customers_model": cust_model, "features": feats,
                 "level_y": level_y, "level_c": level_c, "anomaly_z": Z, "anomaly_scale": prod_scale},
                OUT / "branch.joblib")
    return {"rows": len(df), "stores": int(df.Store.nunique()), "holdout_days": 42,
            "rmspe": rmspe(va.Sales.values, np.expm1(pred)), "rmspe_baseline_store_dow_median": rmspe(va.Sales.values, base.values),
            "customers_rmspe": rmspe(va.Customers.values, np.expm1(pred_c)),
            "anomaly": {"z_threshold": Z, "injected": int(hit.sum()),
                        "precision": float(tp / max(flag.sum(), 1)), "recall": float(tp / max(hit.sum(), 1)),
                        "false_alarms_per_store_month": float((flag & ~hit).sum() / va.Store.nunique() / 6 * 4.33)}}


# ---------------------------------------------------------------- new-site revenue
def cv_report(model, X, y):
    kf = KFold(5, shuffle=True, random_state=0)
    p = cross_val_predict(model, X, y, cv=kf)
    base = cross_val_predict(DummyRegressor(), X, y, cv=kf)
    rmse = lambda a: float(np.sqrt(np.mean((a - y) ** 2)))
    return {"rows": len(y), "cv_rmse_log": rmse(p), "cv_rmse_log_baseline_mean": rmse(base),
            "cv_mape": float(np.mean(np.abs(np.expm1(p) - np.expm1(y)) / np.expm1(y)))}


def train_site():
    """New-site revenue from TFI restaurants (137 sites). Rossmann store attributes were tried and
    did no better than the mean - no public data has the demographics a site model needs."""
    t = pd.read_csv(RAW / "tfi" / "train.csv")
    t["age_days"] = (pd.Timestamp("2015-01-01") - pd.to_datetime(t["Open Date"])).dt.days
    Xt = pd.get_dummies(t[["City Group", "Type", "age_days"] + [f"P{i}" for i in range(1, 38)]], dtype=float)
    yt = np.log1p(t.revenue.values)
    tfi = RandomForestRegressor(500, min_samples_leaf=5, max_features=0.3, random_state=0, n_jobs=-1)
    r_tfi = cv_report(tfi, Xt, yt)
    joblib.dump({"model": tfi.fit(Xt, yt), "features": list(Xt.columns), "target": "log1p annual revenue"},
                OUT / "site_tfi.joblib")
    return {"tfi_restaurants": r_tfi}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = {"demand_favorita": train_demand_favorita, "demand_m5": train_demand_m5,
            "branch": train_branch, "site": train_site}
    mpath = OUT / "metrics.json"
    metrics = json.loads(mpath.read_text()) if mpath.exists() else {}
    for name in sys.argv[1:] or jobs:
        print(f"== {name}", flush=True)
        metrics[name] = jobs[name]()
        print(json.dumps(metrics[name], indent=2), flush=True)
        mpath.write_text(json.dumps(metrics, indent=2))  # after each job, so a crash keeps earlier results
