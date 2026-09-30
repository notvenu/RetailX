"""Download public training datasets into ml/raw/<name>/.

Needs a Kaggle API token (~/.kaggle/access_token or kaggle.json) and, for
competitions, the rules accepted once on kaggle.com (Join / "I understand").
"""
import subprocess, sys, zipfile
from pathlib import Path

RAW = Path(__file__).parent / "raw"

COMPETITIONS = {  # used by train.py
    "store-sales": "store-sales-time-series-forecasting",  # Favorita, SKU-family demand
    "rossmann": "rossmann-store-sales",                    # branch daily sales/customers + store features
    "tfi": "restaurant-revenue-prediction",                # new-site revenue
    "m5": "m5-forecasting-accuracy",                       # extra: Walmart item-level (~450 MB)
}
DATASETS = {  # extra / reference, not used by train.py yet
    "walmart": "divyajeetthakur/walmart-sales-prediction",
    "bigmart": "shivan118/big-mart-sales-prediction-datasets",
    "inventory": "atomicd/retail-store-inventory-and-demand-forecasting",
    "in-holidays": "suhaibmukhtar/holidays-dataset",
    "diwali": "prajwal6362venom/diwali-sales",
    "supermart": "mohamedharris/supermart-grocery-sales-retail-analytics-dataset",
}


def fetch(kind, ref, dest):
    if dest.exists() and any(dest.glob("*.csv")):
        print(f"skip {dest.name} (already present)")
        return True
    dest.mkdir(parents=True, exist_ok=True)
    flag = "-c" if kind == "competitions" else "-d"
    r = subprocess.run([sys.executable, "-m", "kaggle", kind, "download", flag, ref, "-p", str(dest)])
    if r.returncode:
        print(f"FAILED {ref} (competition rules accepted? token set?)")
        return False
    # competitions come as nested zips (e.g. train.csv.zip inside the archive)
    while zips := list(dest.glob("*.zip")):
        for z in zips:
            zipfile.ZipFile(z).extractall(dest)
            z.unlink()
    return True


if __name__ == "__main__":
    ok = [fetch("competitions", ref, RAW / name) for name, ref in COMPETITIONS.items()]
    ok += [fetch("datasets", ref, RAW / name) for name, ref in DATASETS.items()]
    sys.exit(0 if all(ok) else 1)
