"""Pretend to be many visitors at once and report how the server copes. Standard library only.

    python3 deploy/loadtest.py --base https://18-141-67-33.nip.io --users 100 --duration 90

Each visitor opens the site the way the web app does (index, meta, the country's monthly series, the map for the last 5 years, the daily
calendar), then keeps going for the whole duration: thinks for a few seconds, then changes the period, the month or the country, now and then
opens the Calendar tab (temperature map) or draws a small area. Every visitor starts within `--ramp` seconds (0 = all at once, the worst case).
Prints latency percentiles per kind of request, errors, cache hits (the X-Cache-Status header, when the server sends it) and the host's load average.
Run it ON the server to measure the server alone: from a laptop the home connection is the limit.
"""
import argparse
import http.client
import os
import random
import ssl
import threading
import time
import urllib.parse
from collections import defaultdict

# name in the data, box (west, south, east, north)
COUNTRIES = [
    ("Vietnam", (102.1, 8.4, 109.5, 23.4)),
    ("Brazil", (-74.0, -33.8, -34.8, 5.3)),
    ("Indonesia", (95.0, -11.0, 141.0, 6.0)),
    ("India", (68.1, 6.7, 97.4, 35.5)),
    ("Australia", (112.0, -44.0, 154.0, -10.0)),
    ("United_States", (-125.0, 24.5, -66.9, 49.5)),
    ("Democratic_Republic_of_the_Congo", (12.2, -13.5, 31.3, 5.4)),
    ("Argentina", (-73.6, -55.0, -53.6, -21.8)),
    ("Thailand", (97.3, 5.6, 105.6, 20.5)),
    ("Mexico", (-118.4, 14.5, -86.7, 32.7)),
]
MONTHS = [f"{y}-{m:02d}" for y in range(2018, 2026) for m in range(1, 13)]
WEIGHTS = [10, 4, 3, 3, 3, 3, 2, 2, 2, 2]  # most people look at the first one, as in a demo

lock = threading.Lock()
results: dict[str, list[tuple[float, int, str]]] = defaultdict(list)
load_samples: list[float] = []


class Visitor(threading.Thread):
    def __init__(self, base: str, end: float, ramp: float, seed: int):
        super().__init__(daemon=True)
        u = urllib.parse.urlparse(base)
        self.https, self.host, self.port = u.scheme == "https", u.hostname, u.port or (443 if u.scheme == "https" else 80)
        self.end, self.ramp, self.rng = end, ramp, random.Random(seed)
        self.conn = None

    def get(self, kind: str, path: str) -> None:
        t0 = time.time()
        status, cache = 0, ""
        for attempt in (0, 1):  # a dropped keep-alive connection is retried once, like a browser does
            try:
                if self.conn is None:
                    self.conn = (http.client.HTTPSConnection(self.host, self.port, timeout=90, context=ssl.create_default_context())
                                 if self.https else http.client.HTTPConnection(self.host, self.port, timeout=90))
                self.conn.request("GET", path, headers={"Accept-Encoding": "gzip, br", "User-Agent": "loadtest"})
                r = self.conn.getresponse()
                r.read()
                status, cache = r.status, r.getheader("X-Cache-Status", "")
                break
            except Exception:
                try:
                    self.conn.close()
                except Exception:
                    pass
                self.conn = None
                status = -1
        with lock:
            results[kind].append((time.time() - t0, status, cache))

    def hexes(self, box, start: str, end: str, country: str) -> None:
        w, s, e, n = box
        self.get("hexes", f"/api/hexes?west={w}&south={s}&east={e}&north={n}&from={start}&to={end}&source=harmonized&res=7&country={country}")

    def box_q(self, box) -> str:
        w, s, e, n = box
        return f"south={s}&north={n}&west={w}&east={e}"

    def open_site(self, name: str, box) -> None:
        self.get("index", "/")
        self.get("meta", "/api/meta")
        self.get("monthly", f"/api/monthly?{self.box_q(box)}&country={name}")
        self.hexes(box, "2021-01", "2025-12", name)
        self.get("daily", f"/api/daily?{self.box_q(box)}&ym=2025-12&country={name}")

    def run(self) -> None:
        time.sleep(self.rng.uniform(0, self.ramp))
        name, box = self.rng.choices(COUNTRIES, WEIGHTS)[0]
        self.open_site(name, box)
        while time.time() < self.end:
            time.sleep(self.rng.uniform(3, 10))
            if time.time() >= self.end:
                break
            roll = self.rng.random()
            ym = self.rng.choice(MONTHS)
            if roll < 0.30:  # another month: the daily calendar, sometimes the temperature map of the Calendar tab
                self.get("daily", f"/api/daily?{self.box_q(box)}&ym={ym}&country={name}")
                if self.rng.random() < 0.6:
                    self.get("temps", f"/api/temps?{self.box_q(box)}&month={ym}")
            elif roll < 0.55:  # another period on the Overview
                a, b = self.rng.choice([("2016-01", "2025-12"), ("2000-11", "2025-12"), ("2021-01", "2025-12"), ("2023-01", "2023-12")])
                self.hexes(box, a, b, name)
            elif roll < 0.80:  # another country (same cost as opening the site)
                name, box = self.rng.choices(COUNTRIES, WEIGHTS)[0]
                self.open_site(name, box)
            elif roll < 0.88:  # Similar years
                self.get("analog", f"/api/analog?{self.box_q(box)}&country={name}")
            elif roll < 0.95:  # a day on the Calendar tab
                self.get("temps_day", f"/api/temps?{self.box_q(box)}&day={ym}-{self.rng.randint(1, 28):02d}")
            elif roll < 0.98:  # a small drawn area: the slow, exact path
                w, s = box[0] + self.rng.uniform(0, 2), box[1] + self.rng.uniform(0, 2)
                self.get("small_area", f"/api/monthly?south={s:.3f}&north={s + 1:.3f}&west={w:.3f}&east={w + 1:.3f}")
            else:  # the CSV of the fire cells
                self.get("cells_csv", f"/api/export.csv?{self.box_q(box)}&level=cells&start={ym}&end={ym}")


def pct(values: list[float], p: float) -> float:
    values = sorted(values)
    return values[min(len(values) - 1, int(len(values) * p))] if values else 0.0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True)
    ap.add_argument("--users", type=int, default=100)
    ap.add_argument("--duration", type=int, default=90, help="seconds each visitor keeps going")
    ap.add_argument("--ramp", type=float, default=0, help="spread the start of the visitors over this many seconds (0 = all at once)")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    end = time.time() + a.duration
    users = [Visitor(a.base, end, a.ramp, a.seed * 1000 + i) for i in range(a.users)]
    t0 = time.time()
    for u in users:
        u.start()
    while any(u.is_alive() for u in users) and time.time() < end + 120:
        if hasattr(os, "getloadavg"):
            load_samples.append(os.getloadavg()[0])
        time.sleep(5)
    total = time.time() - t0
    print(f"{a.users} visitors, {a.duration} s, ramp {a.ramp} s, took {total:.0f} s in all")
    print(f"{'request':<11}{'n':>6}{'p50':>8}{'p95':>8}{'max':>8}{'errors':>8}{'cache hits':>12}")
    every, bad = [], 0
    for kind in ("index", "meta", "monthly", "hexes", "daily", "temps", "temps_day", "analog", "small_area", "cells_csv"):
        rows = results.get(kind, [])
        if not rows:
            continue
        lat = [r[0] for r in rows]
        errs = sum(1 for r in rows if r[1] != 200)
        hits = sum(1 for r in rows if r[2] == "HIT")
        every += lat
        bad += errs
        seen = sum(1 for r in rows if r[2])
        print(f"{kind:<11}{len(rows):>6}{pct(lat, .5):>7.2f}s{pct(lat, .95):>7.2f}s{max(lat):>7.2f}s{errs:>8}{(f'{hits}/{seen}' if seen else '-'):>12}")
    print(f"{'ALL':<11}{len(every):>6}{pct(every, .5):>7.2f}s{pct(every, .95):>7.2f}s{max(every):>7.2f}s{bad:>8}")
    if load_samples:
        print(f"host load average (1 min): max {max(load_samples):.1f}, mean {sum(load_samples) / len(load_samples):.1f}  (2 = both vCPUs fully busy)")


if __name__ == "__main__":
    main()
