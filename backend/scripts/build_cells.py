"""Squeeze the data team's per-year files into a slim cell-day table: what the temperature map and the "fire cells" CSV read.

    python scripts/build_cells.py --src C:/nasa-data/harmonize_final --out C:/nasa-data/cells

Output: <out>/ym=YYYY-MM/*.parquet, one row per (date, H3 res7 cell, sensor) with
    acq_date DATE, h3_res7 VARCHAR, lat FLOAT, lon FLOAT,
    sensor ('modis' | 'viirs'), temp_c FLOAT (hottest mid-infrared brightness temperature bright_mir, Celsius),
    frp_mw FLOAT (strongest fire radiative power), n INTEGER (observations)

Same filters as build_hex_months.py, so the numbers agree with the hexagon files: vegetation fires only (type 0), low-confidence
points removed (conf_l), MODIS estimated onto the VIIRS scale as 'modis', S-NPP as 'viirs'; NOAA-20 and later satellites are left out.
About a quarter of the size of the per-year files, which is what makes the data practical to ship to a server.
"""
import argparse
import re
from pathlib import Path

import duckdb


def _q(path: Path | str) -> str:
    return str(path).replace("\\", "/").replace("'", "''")


def build_cells(src: str, out_dir: Path, memory: str = "5GB", threads: int = 4) -> None:
    """Write the slim table for the files matched by `src` (a path or glob). Months already in `out_dir` are replaced."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"SET threads={int(threads)}; SET memory_limit='{memory}'; SET temp_directory='{_q(out_dir / '.spill')}'")
    con.execute(
        f"""
        COPY (
            SELECT acq_date, h3_res7,
                   CAST(ANY_VALUE(center_lat) AS FLOAT) AS lat, CAST(ANY_VALUE(center_lon) AS FLOAT) AS lon,
                   CASE WHEN record_origin = 'OBSERVED_VIIRS' THEN 'viirs' ELSE 'modis' END AS sensor,
                   CAST(MAX(bright_mir) - 273.15 AS FLOAT) AS temp_c, CAST(MAX(frp) AS FLOAT) AS frp_mw, CAST(COUNT(*) AS INTEGER) AS n,
                   strftime(acq_date, '%Y-%m') AS ym
            FROM read_parquet('{_q(src)}', union_by_name = true)
            WHERE COALESCE(type, 0) = 0 AND (point_count - COALESCE(conf_l, 0)) > 0
              AND (record_origin <> 'OBSERVED_VIIRS' OR source_platform = 'S-NPP')
            GROUP BY acq_date, h3_res7, CASE WHEN record_origin = 'OBSERVED_VIIRS' THEN 'viirs' ELSE 'modis' END
            ORDER BY acq_date, lat
        ) TO '{_q(out_dir)}' (FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY (ym), OVERWRITE_OR_IGNORE)
        """
    )
    con.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="folder with YYYY.parquet files (or a glob)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--memory", default="5GB")
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()
    src = Path(a.src)
    files = sorted(f for f in src.glob("*.parquet") if re.fullmatch(r"\d{4}\.parquet", f.name)) if src.is_dir() else [src]
    for f in files:
        build_cells(str(f), Path(a.out), a.memory, a.threads)
        print(f"  {f.name}: done", flush=True)
    months = sorted(p.name for p in Path(a.out).glob("ym=*"))
    print(f"{len(months)} months in {a.out}")
