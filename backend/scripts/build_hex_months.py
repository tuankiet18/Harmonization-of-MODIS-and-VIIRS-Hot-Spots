"""Squeeze the data team's world H3 parquet (one row per date / day-night / sensor / res7 cell / country) into one row per
cell and month, so the API can answer "which hexagons had fire this month, on how many days" without scanning gigabytes.

    python scripts/build_hex_months.py --src "D:/data/parquet_h3_world/**/*.parquet" --out data/sample/hex

Output: <out>/ym=YYYY-MM/*.parquet with columns
    h3_res7 VARCHAR, center_lat FLOAT, center_lon FLOAT, sensor ('modis'|'viirs'), country VARCHAR,
    days_mask INTEGER  (bit d-1 set when the cell had a detection on day d, so popcount = days with fire),
    points INTEGER     (good detections summed over the month),
    temp_max FLOAT     (hottest brightness temperature, MIR channel, K; null when the input has no `bright_mir`),
    frp_sum FLOAT      (fire radiative power summed over the month, MW; null when the input has no `frp`)

What is dropped, so the numbers describe fires in vegetation that the sensors are fairly sure about:
  * `type` other than 0 (static land sources, volcanoes, offshore), unless --keep-static. Input without a `type` column is not filtered.
  * Low-confidence points, unless --keep-low-confidence. With the per-tier counts (`conf_l`) exactly those points are removed
    (a day whose points are all low confidence disappears); without them (older files) rows with conf_tier 'low' are removed.
    `frp_sum` and `temp_max` come from whole rows, so they can still include a few low-confidence points of a mixed row.

The day and night passes of one date count once. Files in the older and the newer schema can be built together.
"""
import argparse
import json
from pathlib import Path

import duckdb


def build_hex_months(src: str, out_dir: Path, keep_low_confidence: bool = False, keep_static: bool = False) -> dict:
    """Write the per-month hex files and return {"months": [...], "rows": n} for everything now in `out_dir`."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    read = f"read_parquet('{src}', union_by_name = true)"
    cols = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {read}").fetchall()}

    if keep_low_confidence:
        good = "point_count"
    elif "conf_l" in cols:  # exact per-point counts; a file without them (NULL) falls back to its tier
        good = "(point_count - COALESCE(conf_l, CASE WHEN conf_tier = 'low' THEN point_count ELSE 0 END))"
    else:
        good = "(CASE WHEN conf_tier = 'low' THEN 0 ELSE point_count END)"
    type_ok = "COALESCE(type, 0) = 0" if "type" in cols and not keep_static else "TRUE"
    temp = "CAST(max(bright_mir) AS FLOAT)" if "bright_mir" in cols else "CAST(NULL AS FLOAT)"
    frp = "CAST(sum(frp) AS FLOAT)" if "frp" in cols else "CAST(NULL AS FLOAT)"

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
                   CAST(sum(good_points) AS INTEGER) AS points,
                   {temp} AS temp_max,
                   {frp} AS frp_sum
            FROM (SELECT *, {good} AS good_points FROM {read})
            WHERE {type_ok} AND good_points > 0
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
    ap.add_argument("--keep-static", action="store_true", help="keep type 2 (static land sources), 1 (volcano) and 3 (offshore)")
    a = ap.parse_args()
    s = build_hex_months(a.src, Path(a.out), a.keep_low_confidence, a.keep_static)
    print(f"{s['rows']} rows, {len(s['months'])} months ({s['months'][0] if s['months'] else '-'} .. {s['months'][-1] if s['months'] else '-'})")
