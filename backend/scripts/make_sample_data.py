"""Writes SYNTHETIC Parquet files in the shape of docs/DATA_CONTRACT.md so the API and the web app run before real data
exists. The numbers are fake (but follow the real analysis: VIIRS counts 3.6-5x MODIS, regional fire seasons).

    python scripts/make_sample_data.py                # -> data/sample
    python scripts/make_sample_data.py --out data/x   # elsewhere

Files written: monthly.parquet (cell x month), daily.parquet (cell x day, recent months only),
points.parquet (a SAMPLE of detections, last 3 months only), meta.json.
Counts are active cell-days (one cell with at least one detection on one day). Harmonized series: MODIS x monthly
factor before 2013, S-NPP VIIRS as is from 2013 (the data team's method).
"""
import argparse
import csv
import json
import math
import random
import tempfile
from dataclasses import dataclass
from pathlib import Path

import duckdb

FIRST, LAST = "2000-11", "2026-10"
VIIRS_START = "2012-01"
CALIB_START, CALIB_END = "2013-01", "2022-12"  # months used to fit the MODIS -> VIIRS factors; VIIRS is used as is from CALIB_START
NRT_START = "2026-01"
DAILY_START = "2024-01"
POINT_MONTHS = ("2026-08", "2026-09", "2026-10")
POINTS_PER_CELL_SENSOR = 40


@dataclass(frozen=True)
class Region:
    id: str
    west: float
    south: float
    east: float
    north: float
    peak_month: int
    intensity: float
    ratio: float  # VIIRS count / MODIS count, from docs/DATA_ANALYSIS.md


REGIONS = [
    Region("amazon", -66, -14, -52, -4, 9, 1.0, 3.6),
    Region("california", -124, 32.5, -114, 42, 8, 0.45, 4.5),
    Region("se-australia", 144, -39, 154, -28, 1, 0.5, 5.0),
    Region("siberia", 100, 56, 120, 64, 7, 0.7, 4.3),
    Region("central-africa", 14, -12, 28, -2, 7, 1.3, 3.8),
    Region("sea", 98, 12, 108, 22, 3, 0.9, 5.0),
]


def months(start: str, end: str) -> list[str]:
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y}-{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def days_in_month(ym: str) -> int:
    y, m = map(int, ym.split("-"))
    return [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]


def split_total(total: float, weights: list[float], integer: bool) -> list[float]:
    """Split `total` over days in proportion to `weights`; integer parts add back up exactly (largest remainder)."""
    s = sum(weights)
    exact = [total * w / s for w in weights]
    if not integer:
        return [round(x, 4) for x in exact]
    base = [math.floor(x) for x in exact]
    missing = round(total) - sum(base)
    for _, i in sorted(((e - b, i) for i, (e, b) in enumerate(zip(exact, base))), reverse=True)[:missing]:
        base[i] += 1
    return base


def day_weights(rng: random.Random, n: int) -> list[float]:
    raw = [math.exp(0.9 * rng.gauss(0, 1)) for _ in range(n)]
    return [(raw[max(0, i - 1)] + 2 * raw[i] + raw[min(n - 1, i + 1)]) / 4 for i in range(n)]


def cells(r: Region) -> list[tuple[float, float]]:
    out, lat = [], r.south + 0.5
    while lat < r.north:
        lon = r.west + 0.5
        while lon < r.east:
            out.append((lat, lon))
            lon += 1
        lat += 1
    return out


def build(out_dir: Path, regions: list[Region] = REGIONS, seed: int = 7, daily_start: str = DAILY_START,
          point_months: tuple[str, ...] = POINT_MONTHS) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    all_months = months(FIRST, LAST)
    year_factor: dict[tuple[str, int], float] = {}

    def yf(region: str, year: int) -> float:
        k = (region, year)
        if k not in year_factor:
            rng = random.Random(f"{seed}:{region}:{year}")
            v = math.exp(0.35 * rng.gauss(0, 1))
            year_factor[k] = v * 2.2 if rng.random() < 0.12 else v
        return year_factor[k]

    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        with open(t / "m.csv", "w", newline="") as fm, open(t / "d.csv", "w", newline="") as fd, open(t / "p.csv", "w", newline="") as fp:
            wm, wd, wp = csv.writer(fm), csv.writer(fd), csv.writer(fp)
            wm.writerow(["cell_id", "lat", "lon", "year_month", "modis_raw", "viirs_raw", "harmonized", "method", "scale_factor", "in_calibration", "data_status"])
            wd.writerow(["cell_id", "lat", "lon", "date", "ym", "modis_raw", "viirs_raw", "harmonized"])
            wp.writerow(["lat", "lon", "date", "ym", "sensor"])
            for reg in regions:
                for lat, lon in cells(reg):
                    cell_id = f"{lat:.2f}_{lon:.2f}"
                    rng = random.Random(f"{seed}:{cell_id}")
                    cell_factor = math.exp(0.5 * rng.gauss(0, 1))
                    rows = []
                    for ym in all_months:
                        y, m = int(ym[:4]), int(ym[5:])
                        seasonal = math.exp(2.2 * (math.cos(2 * math.pi * (m - reg.peak_month) / 12) - 1))
                        truth = 40 * reg.intensity * cell_factor * seasonal * yf(reg.id, y) * (0.8 + 0.4 * rng.random())
                        modis = round(truth * (0.9 + 0.2 * rng.random()))
                        viirs = round(truth * reg.ratio * (0.9 + 0.2 * rng.random())) if ym >= VIIRS_START else None
                        rows.append((ym, modis, viirs))
                    # MODIS -> VIIRS (S-NPP) factor per calendar month, fitted on the calibration window.
                    fit = {mm: [0, 0] for mm in range(1, 13)}
                    for ym, mo, vi in rows:
                        if vi is not None and CALIB_START <= ym <= CALIB_END:
                            fit[int(ym[5:])][0] += mo
                            fit[int(ym[5:])][1] += vi
                    for ym, modis, viirs in rows:
                        mo_sum, vi_sum = fit[int(ym[5:])]
                        if ym < CALIB_START:
                            f = vi_sum / mo_sum if mo_sum and vi_sum else reg.ratio
                            harm, method, factor = modis * f, "modis_scaled", round(f, 3)
                        else:
                            harm, method, factor = float(viirs), "viirs_native", None
                        harm = round(harm, 1)
                        wm.writerow([cell_id, lat, lon, ym, modis, "" if viirs is None else viirs, harm, method,
                                     "" if factor is None else factor, str(CALIB_START <= ym <= CALIB_END).lower(),
                                     "nrt" if ym >= NRT_START else "standard"])
                        if ym >= daily_start:
                            w = day_weights(random.Random(f"{seed}:{cell_id}:{ym}:d"), days_in_month(ym))
                            dm = split_total(modis, w, True)
                            dv = split_total(viirs, w[::-1], True) if viirs is not None else None  # sensors peak on different days
                            dh = split_total(harm, w, False)
                            for i in range(len(w)):
                                wd.writerow([cell_id, lat, lon, f"{ym}-{i + 1:02d}", ym, dm[i], "" if dv is None else dv[i], dh[i]])
                        if ym in point_months:
                            prng = random.Random(f"{seed}:{cell_id}:{ym}:p")
                            centres = [((prng.random() - 0.5) * 0.7, (prng.random() - 0.5) * 0.7) for _ in range(3)]
                            w = day_weights(prng, days_in_month(ym))
                            for sensor, n in (("modis", modis), ("viirs", viirs or 0)):
                                for _ in range(min(n, POINTS_PER_CELL_SENSOR)):
                                    cy, cx = prng.choice(centres)
                                    day = prng.choices(range(1, len(w) + 1), weights=w)[0]
                                    wp.writerow([round(lat + max(-0.5, min(0.5, cy + prng.gauss(0, 0.09))), 4),
                                                 round(lon + max(-0.5, min(0.5, cx + prng.gauss(0, 0.09))), 4),
                                                 f"{ym}-{day:02d}", ym, sensor])

        con = duckdb.connect()
        specs = {
            "monthly": ("m.csv", "{'cell_id':'VARCHAR','lat':'DOUBLE','lon':'DOUBLE','year_month':'VARCHAR','modis_raw':'INTEGER','viirs_raw':'INTEGER','harmonized':'DOUBLE','method':'VARCHAR','scale_factor':'DOUBLE','in_calibration':'BOOLEAN','data_status':'VARCHAR'}", "year_month, cell_id"),
            "daily": ("d.csv", "{'cell_id':'VARCHAR','lat':'DOUBLE','lon':'DOUBLE','date':'DATE','ym':'VARCHAR','modis_raw':'INTEGER','viirs_raw':'INTEGER','harmonized':'DOUBLE'}", "date, cell_id"),
            "points": ("p.csv", "{'lat':'DOUBLE','lon':'DOUBLE','date':'DATE','ym':'VARCHAR','sensor':'VARCHAR'}", "date"),
        }
        counts = {}
        for name, (src, types, order) in specs.items():
            dest = (out_dir / f"{name}.parquet").as_posix()
            con.execute(f"COPY (SELECT * FROM read_csv('{(t / src).as_posix()}', header=true, types={types}) ORDER BY {order}) TO '{dest}' (FORMAT PARQUET, COMPRESSION ZSTD)")
            counts[name] = con.execute(f"SELECT COUNT(*) FROM read_parquet('{dest}')").fetchone()[0]
        con.close()

    meta = {
        "version": "sample-0.1",
        "method": "DEMO: before 2013 MODIS is multiplied by a per-month factor onto the VIIRS (S-NPP) scale, fitted on 2013-2022; from 2013 VIIRS is used as is",
        "source": "Synthetic demo data (not NASA FIRMS)",
        "gridDeg": 1.0,
        "updated": "2026-11-14",
        "firstMonth": FIRST,
        "lastMonth": LAST,
        "isMock": True,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return counts


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data" / "sample"))
    args = ap.parse_args()
    print(build(Path(args.out)))
