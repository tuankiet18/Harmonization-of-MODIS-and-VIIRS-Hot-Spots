"""Download FIRMS hotspots through the Area API, in 5-day chunks, per demo region.

Key is read from the FIRMS_MAP_KEY environment variable (never stored in files).

  FIRMS_MAP_KEY=... python scripts/fetch_firms_api.py --dry-run
  FIRMS_MAP_KEY=... python scripts/fetch_firms_api.py --regions sea --start 2025-03-01 --end 2025-03-31

Output: data/firms-api/<SOURCE>/<region>/<YYYY-MM-DD>.csv  (one file per 5-day chunk).
Re-running skips chunks already on disk, so an interrupted run resumes.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://firms.modaps.eosdis.nasa.gov"
CHUNK_DAYS = 5  # API maximum
SAFETY = 300  # keep this many transactions of headroom under the limit


def load_regions():
    """Read demo regions from the web app so both stay in sync."""
    text = (ROOT / "web/src/data/regions.ts").read_text(encoding="utf-8")
    pat = re.compile(
        r"id:\s*'([\w-]+)'.*?west:\s*(-?[\d.]+),\s*south:\s*(-?[\d.]+),\s*east:\s*(-?[\d.]+),\s*north:\s*(-?[\d.]+)"
    )
    return {m[0]: ",".join(m[1:]) for m in pat.findall(text)}


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read().decode("utf-8-sig")
        except (urllib.error.URLError, TimeoutError) as e:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def status(key):
    s = json.loads(get(f"{BASE}/mapserver/mapkey_status/?MAP_KEY={key}"))
    return s["transaction_limit"], s["current_transactions"]


def wait_for_budget(key, need):
    """Sleep until `need` transactions fit under the limit."""
    while True:
        limit, used = status(key)
        if used + need + SAFETY <= limit:
            return used
        print(f"  budget {used}/{limit}, waiting 60s for the 10-minute window to roll over", flush=True)
        time.sleep(60)


def main():
    regions = load_regions()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default="VIIRS_NOAA21_SP")
    ap.add_argument("--start", default="2023-03-01", type=date.fromisoformat)
    ap.add_argument("--end", default="2026-07-31", type=date.fromisoformat)
    ap.add_argument("--regions", nargs="+", default=list(regions), choices=list(regions))
    ap.add_argument("--out", default=str(ROOT / "data/firms-api"))
    ap.add_argument("--dry-run", action="store_true", help="count chunks and exit; makes no API calls")
    a = ap.parse_args()

    chunks = []
    d = a.start
    while d <= a.end:
        chunks.append(d)
        d += timedelta(days=CHUNK_DAYS)
    todo = [(r, d) for r in a.regions for d in chunks
            if not (Path(a.out) / a.source / r / f"{d}.csv").exists()]
    print(f"{a.source}: {len(a.regions)} regions x {len(chunks)} chunks, {len(todo)} still to fetch")
    if a.dry_run or not todo:
        return

    key = os.environ.get("FIRMS_MAP_KEY")
    if not key:
        sys.exit("Set FIRMS_MAP_KEY in the environment first.")

    reserve = 100  # assumed cost of one chunk until we measure real ones
    for n, (region, d) in enumerate(todo, 1):
        before = wait_for_budget(key, reserve)
        url = f"{BASE}/api/area/csv/{key}/{a.source}/{regions[region]}/{CHUNK_DAYS}/{d}"
        body = get(url)
        if not body.startswith("latitude"):
            sys.exit(f"Unexpected response for {region} {d}: {body[:200]!r}")
        path = Path(a.out) / a.source / region / f"{d}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(body, encoding="utf-8", newline="")
        tmp.replace(path)
        _, after = status(key)
        cost = max(after - before, 0)
        reserve = max(reserve, int(cost * 1.5))  # adapt to the largest chunk seen
        print(f"[{n}/{len(todo)}] {region} {d}: {body.count(chr(10)) - 1} rows, cost {cost} (used {after})", flush=True)


if __name__ == "__main__":
    main()
