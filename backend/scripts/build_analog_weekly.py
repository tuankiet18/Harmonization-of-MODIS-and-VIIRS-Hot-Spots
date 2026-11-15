"""Builds analog_weekly.parquet (+ analog_meta.json): the weekly table behind /api/analog (docs/DATA_CONTRACT.md).

One row per (1 degree bin, year, week). It holds sums, so any area is the sum of the bins whose centre lies inside it:

    sum_frp    sum over H3 cell-days of the cell-day's maximum FRP (MW)
    sum_score  sum of frp * confidence weight * thermal contrast          (the notebook's "fire score")
    sum_temp   sum of the thermal contrast (bright_mir - bright_tir) / bright_tir
    sum_conf   sum of the confidence weight (1.0 conf_h + 0.6 conf_n + 0.2 conf_l) / point_count
    n_cells    number of H3 cell-days

Real data (the data team's per-year harmonized files, 25 columns, e.g. harmonize_final/2018.parquet):

    python scripts/build_analog_weekly.py --src D:/data/harmonize_final --out data/real
    python scripts/build_analog_weekly.py --src D:/data/harmonize_final --out data/real --years 2018 2019

Demo data, so the feature runs before the real table exists (SYNTHETIC numbers, flagged isMock in analog_meta.json):

    python scripts/build_analog_weekly.py --synthetic --out data/sample

Only vegetation fires (type = 0) are used, as in the notebook. Several satellites in one cell-day count once (max FRP).
"""
import argparse
import json
import math
import random
import re
import tempfile
from datetime import date
from pathlib import Path

import duckdb

BIN_DEG = 1.0
VIIRS_FROM_YEAR = 2012
METHOD = (
    "Weekly FRP, thermal contrast and confidence per H3 cell-day (vegetation fires), compared year by year with cosine "
    "similarity and a banded DTW (the data team's burning-calendar notebook). Complete weeks only."
)

COLUMNS = "bin_lat DOUBLE, bin_lon DOUBLE, year SMALLINT, week TINYINT, sum_frp DOUBLE, sum_score DOUBLE, sum_temp DOUBLE, sum_conf DOUBLE, n_cells INTEGER"


def _q(path: Path | str) -> str:
    return str(path).replace("\\", "/").replace("'", "''")


def build_real(src: Path, out_dir: Path, years: list[int] | None = None, threads: int = 4, memory: str = "6GB") -> dict:
    files = {}
    for f in sorted(src.glob("*.parquet")):
        m = re.fullmatch(r"(\d{4})\.parquet", f.name)
        if m and (not years or int(m.group(1)) in years):
            files[int(m.group(1))] = f
    if not files:
        raise SystemExit(f"No YYYY.parquet files in {src}")
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out_dir) as tmp:
        con = duckdb.connect()
        con.execute(f"SET threads={int(threads)}; SET memory_limit='{memory}'; SET temp_directory='{_q(Path(tmp) / 'spill')}'")
        for year, f in files.items():
            con.execute(
                f"""
                COPY (
                  WITH cell_day AS (
                    SELECT acq_date, h3_res7,
                           ANY_VALUE(center_lat) AS lat, ANY_VALUE(center_lon) AS lon,
                           MAX(CAST(frp AS DOUBLE)) AS cell_frp,
                           MAX(GREATEST(bright_mir - bright_tir, 0.0) / GREATEST(bright_tir, 1.0)) AS cell_temp,
                           AVG((1.0 * conf_h + 0.6 * conf_n + 0.2 * conf_l) / GREATEST(point_count, 1)) AS cell_conf
                    FROM read_parquet('{_q(f)}')
                    WHERE type = 0 AND year(acq_date) = {year}
                    GROUP BY acq_date, h3_res7
                  )
                  SELECT CAST(floor(lat) + 0.5 AS DOUBLE) AS bin_lat, CAST(floor(lon) + 0.5 AS DOUBLE) AS bin_lon,
                         CAST({year} AS SMALLINT) AS year,
                         CAST(LEAST((dayofyear(acq_date) - 1) // 7 + 1, 52) AS TINYINT) AS week,
                         SUM(cell_frp) AS sum_frp, SUM(cell_frp * cell_conf * cell_temp) AS sum_score,
                         SUM(cell_temp) AS sum_temp, SUM(cell_conf) AS sum_conf, CAST(COUNT(*) AS INTEGER) AS n_cells
                  FROM cell_day GROUP BY 1, 2, 3, 4
                ) TO '{_q(Path(tmp) / f'{year}.parquet')}' (FORMAT PARQUET, COMPRESSION ZSTD)
                """
            )
            print(f"  {year}: done", flush=True)
        n = _finish(con, Path(tmp), out_dir)
        con.close()
    meta = _meta(
        out_dir, sorted(files), is_mock=False,
        source="NASA FIRMS MODIS and VIIRS, harmonized by the data team (per-year H3 res7 files)",
    )
    return {"rows": n, **meta}


def _finish(con: duckdb.DuckDBPyConnection, tmp: Path, out_dir: Path) -> int:
    dest = out_dir / "analog_weekly.parquet"
    con.execute(
        f"COPY (SELECT * FROM read_parquet('{_q(tmp)}/*.parquet') ORDER BY bin_lat, bin_lon, year, week) "
        f"TO '{_q(dest)}' (FORMAT PARQUET, COMPRESSION ZSTD)"
    )
    return con.execute(f"SELECT COUNT(*) FROM read_parquet('{_q(dest)}')").fetchone()[0]


def _meta(out_dir: Path, years: list[int], is_mock: bool, source: str) -> dict:
    meta = {
        "source": source,
        "method": METHOD,
        "isMock": is_mock,
        "binDeg": BIN_DEG,
        "firstYear": min(years),
        "lastYear": max(years),
        "viirsFromYear": VIIRS_FROM_YEAR,
        "built": date.today().isoformat(),
    }
    (out_dir / "analog_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


# ---------------------------------------------------------------------------------------------------------------------------
# Synthetic demo data
# ---------------------------------------------------------------------------------------------------------------------------
def build_synthetic(out_dir: Path, regions=None, seed: int = 11, last_year: int = 2026, last_week: int = 43) -> dict:
    """Fire seasons with a regional peak, and a few year types (early, normal, late, strong) so analogs are not all alike."""
    import csv

    from make_sample_data import REGIONS, cells

    regions = REGIONS if regions is None else regions
    out_dir.mkdir(parents=True, exist_ok=True)
    years = list(range(2000, last_year + 1))
    with tempfile.TemporaryDirectory(dir=out_dir) as tmp:
        t = Path(tmp)
        with open(t / "w.csv", "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["bin_lat", "bin_lon", "year", "week", "sum_frp", "sum_score", "sum_temp", "sum_conf", "n_cells"])
            for reg in regions:
                peak = (reg.peak_month - 0.5) * 52 / 12
                kinds = {y: random.Random(f"{seed}:{reg.id}:{y}") for y in years}
                shape = {}
                for y, r in kinds.items():
                    shape[y] = (r.choice([-9, -6, -3, 0, 0, 3, 6, 9]) + r.gauss(0, 1.0), math.exp(0.35 * r.gauss(0, 1)) * (2.0 if r.random() < 0.1 else 1.0), r.uniform(2.5, 6.5))
                for lat, lon in cells(reg):
                    rng = random.Random(f"{seed}:{lat}:{lon}")
                    cell_factor = math.exp(0.5 * rng.gauss(0, 1))
                    for y in years:
                        shift, amp, kk = shape[y]
                        era = 0.25 if y < VIIRS_FROM_YEAR else 1.0
                        top_week = 52 if y < last_year else last_week
                        for wk in range(1, top_week + 1):
                            if y == 2000 and wk < 44:
                                continue
                            season = math.exp(kk * (math.cos(2 * math.pi * (wk - peak - shift) / 52) - 1))
                            n = round(400 * reg.intensity * cell_factor * amp * era * season * (0.85 + 0.3 * rng.random()))
                            if n <= 0:
                                continue
                            frp = n * 18 * (0.8 + 0.4 * rng.random()) * (1 + 0.5 * season)
                            contrast = 0.12 * (0.9 + 0.2 * rng.random())
                            conf = 0.85 * (0.97 + 0.06 * rng.random())
                            w.writerow([lat, lon, y, wk, round(frp, 2), round(frp * conf * contrast, 3), round(n * contrast, 3), round(n * conf, 3), n])
        con = duckdb.connect()
        con.execute(
            f"COPY (SELECT * FROM read_csv('{_q(t / 'w.csv')}', header=true, columns={{'bin_lat':'DOUBLE','bin_lon':'DOUBLE','year':'SMALLINT','week':'TINYINT',"
            f"'sum_frp':'DOUBLE','sum_score':'DOUBLE','sum_temp':'DOUBLE','sum_conf':'DOUBLE','n_cells':'INTEGER'}}) ORDER BY bin_lat, bin_lon, year, week) "
            f"TO '{_q(t)}/w.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)"
        )
        (t / "w.csv").unlink()
        n = _finish(con, t, out_dir)
        con.close()
    meta = _meta(out_dir, years, is_mock=True, source="Synthetic demo data (not NASA FIRMS)")
    return {"rows": n, **meta}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", help="folder with the per-year harmonized files (YYYY.parquet)")
    ap.add_argument("--synthetic", action="store_true", help="write SYNTHETIC demo data instead")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data" / "sample"))
    ap.add_argument("--years", nargs="+", type=int, help="only these years (real data)")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--memory", default="6GB")
    a = ap.parse_args()
    if a.synthetic:
        print(build_synthetic(Path(a.out)))
    elif a.src:
        print(build_real(Path(a.src), Path(a.out), a.years, a.threads, a.memory))
    else:
        ap.error("give --src DIR (real data) or --synthetic")
