"""Author sku_daily.csv (tracked products, September 2026) from store_daily.csv.

Every assumption is written out below: shelf price and cost as of Sep 2026, a normal day's units,
the Ganeshotsav lift per product, and the delivery pattern. Daily units follow the store's own
trade that day (store_daily.csv), so the power cut, the festival rush and the milk failure show up
in the products too. Rerun after editing store_daily.csv or the table below.
"""
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
NORMAL_DAY = 100_000  # store revenue on an ordinary weekday; units scale with the day's trade

# sku, name, category, price, cost, units on a normal day, festival lift, delivery days, reorder point, cover days
PRODUCTS = [
    ("ST-ATTA-10", "Aashirvaad Shudh Chakki Atta 10 kg", "Staples and grains", 499, 456, 9, 1.2, "Tue Fri", 30, 7),
    ("ST-RICE-05", "Indrayani Rice 5 kg", "Staples and grains", 385, 338, 7, 1.3, "Tue Fri", 24, 7),
    ("ST-TOOR-01", "Toor Dal 1 kg", "Staples and grains", 148, 129, 14, 1.4, "Tue Fri", 45, 7),
    ("ST-SUGR-01", "Sugar 1 kg", "Staples and grains", 46, 42, 22, 1.9, "Tue Fri", 70, 7),
    ("ST-JAGR-01", "Kolhapuri Jaggery 1 kg", "Staples and grains", 72, 58, 6, 4.5, "Tue Fri", 20, 7),
    ("OL-SUNF-01", "Fortune Sunflower Oil 1 L", "Edible oil and ghee", 162, 149, 18, 1.6, "Tue Fri", 60, 7),
    ("OL-GHEE-01", "Gowardhan Cow Ghee 1 L", "Edible oil and ghee", 689, 612, 3, 3.0, "Tue", 12, 8),
    ("DA-MILK-05", "Chitale Toned Milk 500 ml", "Dairy and bakery", 30, 27, 95, 1.3, "daily", 100, 1),
    ("BV-TEA-500", "Tata Tea Gold 500 g", "Snacks and beverages", 325, 282, 5, 1.2, "Fri", 16, 8),
    ("SN-PRLG-08", "Parle-G Biscuits 800 g", "Snacks and beverages", 90, 79, 11, 1.2, "Fri", 35, 8),
    ("DF-CASH-25", "Cashew W320 250 g", "Dry fruits and puja", 265, 205, 4, 3.5, "Fri", 14, 16),
    ("PJ-COCO-01", "Coconut, whole", "Dry fruits and puja", 45, 34, 10, 8.0, "Tue Thu Sat", 30, 3),
]
# the festival lift applies on the heaviest festival shopping days only; other days follow store trade
LIFT_DAYS = {"2026-09-11": 0.6, "2026-09-12": 1.0, "2026-09-13": 1.0, "2026-09-18": 0.5, "2026-09-19": 0.5}
EXTRA_STOCK = {("DF-CASH-25", "2026-09-10"): 60, ("OL-GHEE-01", "2026-09-10"): 20, ("ST-JAGR-01", "2026-09-10"): 60,
               ("PJ-COCO-01", "2026-09-11"): 60, ("PJ-COCO-01", "2026-09-12"): 150, ("PJ-COCO-01", "2026-09-13"): 110,
               ("PJ-COCO-01", "2026-09-18"): 40}  # festival pre-orders
NO_DELIVERY = {("DA-MILK-05", "2026-09-29")}  # tanker strike at the dairy agency
COCONUT_SOLD_OUT = "2026-09-13"


def main():
    days = pd.read_csv(HERE / "store_daily.csv")
    rng = np.random.default_rng(2609)  # small day-to-day wobble so no two Tuesdays are identical
    rows = []
    for sku, name, cat, price, cost, base, lift, deliv, reorder, cover in PRODUCTS:
        stock = int(base * cover * 1.1)  # opening stock on 1 Sep
        for _, d in days.iterrows():
            trade = d.revenue / NORMAL_DAY
            demand = base * trade * (1 + (lift - 1) * LIFT_DAYS.get(d.date, 0)) * rng.uniform(0.9, 1.1)
            demand = max(0, int(round(demand)))
            received = 0
            if (deliv == "daily" or d.weekday in deliv.split()) and (sku, d.date) not in NO_DELIVERY:
                target = base * cover * 1.15 if deliv != "daily" else demand * 1.03
                received = max(0, int(round(target - stock)))
            received += EXTRA_STOCK.get((sku, d.date), 0)
            available = stock + received
            if sku == "PJ-COCO-01" and d.date == COCONUT_SOLD_OUT:
                demand = max(demand, available + 40)  # sold out at 19:00 with customers still asking
            sold = min(demand, available)
            shrink = 0
            if d.date == "2026-09-22" and sku == "DF-CASH-25":
                shrink = 21  # about 5 kg: 21 packs of 250 g
            if d.date == "2026-09-22" and sku == "OL-GHEE-01":
                shrink = 9
            shrink = min(shrink, available - sold)
            closing = available - sold - shrink
            rows.append({
                "date": d.date, "sku": sku, "name": name, "category": cat, "price": price, "cost": cost,
                "festival": d.festival if isinstance(d.festival, str) else "",
                "demand_units": demand, "units_sold": sold, "lost_units": demand - sold,
                "revenue": sold * price, "cogs": sold * cost, "opening_stock": stock, "received": received,
                "shrinkage_units": shrink, "closing_stock": closing, "reorder_point": reorder,
            })
            stock = closing
    out = pd.DataFrame(rows)
    out.to_csv(HERE / "sku_daily.csv", index=False)
    print(out.groupby("name")[["units_sold", "lost_units", "revenue", "closing_stock"]].agg(
        {"units_sold": "sum", "lost_units": "sum", "revenue": "sum", "closing_stock": "last"}).to_string())
    print("tracked revenue", out.revenue.sum(), "=", round(out.revenue.sum() / days.revenue.sum() * 100, 1), "% of store")


if __name__ == "__main__":
    main()
