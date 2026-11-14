"""Squeeze the data team's world H3 parquet (one row per date / day-night / sensor / res7 cell / country) into one row per
cell and month, so the API can answer "which hexagons had fire this month, on how many days" without scanning gigabytes.

    python scripts/build_hex_months.py --src "D:/data/parquet_h3_world/**/*.parquet" --out data/sample/hex

Output: <out>/ym=YYYY-MM/*.parquet with columns
    h3_res7 VARCHAR, center_lat FLOAT, center_lon FLOAT, sensor ('modis'|'viirs'), country VARCHAR,
    days_mask INTEGER  (bit d-1 set when the cell had a detection on day d, so popcount = days with fire),
    points INTEGER     (detections summed over the month)

The day/night passes of one date count once. Rows with conf_tier 'low' are dropped unless --keep-low-confidence, the same
confidence filter the team's notebook uses. Nothing else is filtered: the input has no `type` column, so static heat sources
cannot be removed here.
"""
import argparse
import json
from pathlib import Path

import duckdb


def build_hex_months(src: str, out_dir: Path, keep_low_confidence: bool = False) -> dict:
    """Write the per-month hex files and return {"months": [...], "rows": n}."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    where = "" if keep_low_confidence else "WHERE conf_tier IS DISTINCT FROM 'low'"
    con = duckdb.connect()
    con.execute(
        f"""
        COPY (
            SELECT h3_res7,
                   CAST(any_value(center_lat) AS FLOAT) AS center_lat,
                   CAST(any_value(center_lon) AS FLOAT) AS center_lon,
                   lower(sensor_family) AS sensor,
                   country,
                   strftime(acq_date, '%Y-%m') AS ym,
                   CAST(bit_or(1 << (day(acq_date) - 1)) AS INTEGER) AS days_mask,
                   CAST(sum(point_count) AS INTEGER) AS points
            FROM read_parquet('{src}', union_by_name = true)
            {where}
            GROUP BY h3_res7, lower(sensor_family), country, strftime(acq_date, '%Y-%m')
        ) TO '{out_dir.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY (ym), OVERWRITE_OR_IGNORE)
        """
    )
    rows = con.execute(f"SELECT count(*) FROM read_parquet('{out_dir.as_posix()}/ym=*/*.parquet', hive_partitioning = true)").fetchone()[0]
    months = sorted(p.name.removeprefix("ym=") for p in out_dir.glob("ym=*") if p.is_dir())
    summary = {"months": months, "rows": int(rows)}
    (out_dir / "hex_meta.json").write_text(json.dumps(summary), encoding="utf-8")
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="parquet glob, e.g. 'D:/data/parquet_h3_world/**/*.parquet'")
    ap.add_argument("--out", required=True, help="output folder, usually <DATA_DIR>/hex")
    ap.add_argument("--keep-low-confidence", action="store_true")
    a = ap.parse_args()
    s = build_hex_months(a.src, Path(a.out), a.keep_low_confidence)
    print(f"{s['rows']} rows, {len(s['months'])} months ({s['months'][0] if s['months'] else '-'} .. {s['months'][-1] if s['months'] else '-'})")
