"""Pre-add the per-month hex files into a small table, so the monthly series of a big area answers in milliseconds.

    python scripts/build_monthly_bins.py --hex C:/nasa-data/hex

Writes <hex>/monthly_bins.parquet: one row per (0.25 degree bin, month, sensor) with
    bin_lat, bin_lon  centre of the bin (degrees)
    days              fire cell-days in the bin (a cell's days are OR-ed over its country rows first, as the exact query does)
    cells             cells with fire in the bin

The API uses it for areas at least 2 degrees wide and high (a bin centre inside the box decides; the edge is off by at most
a bin), and reads the hex files themselves for smaller areas, which stay exact. Run it again whenever the hex files change.
"""
import argparse
import tempfile
from pathlib import Path

import duckdb

BIN_DEG = 0.25


def _q(path: Path | str) -> str:
    return str(path).replace("\\", "/").replace("'", "''")


def build_monthly_bins(hex_dir: Path, memory: str = "4GB", threads: int = 4) -> int:
    hex_dir = Path(hex_dir)
    months = sorted(p.name.removeprefix("ym=") for p in hex_dir.glob("ym=*") if p.is_dir())
    if not months:
        raise SystemExit(f"No ym=YYYY-MM folders in {hex_dir}")
    years = sorted({m[:4] for m in months})
    dest = hex_dir / "monthly_bins.parquet"
    with tempfile.TemporaryDirectory(dir=hex_dir) as tmp:
        con = duckdb.connect()
        con.execute(f"SET threads={int(threads)}; SET memory_limit='{memory}'; SET temp_directory='{_q(Path(tmp) / 'spill')}'")
        for y in years:  # one year at a time keeps the number of groups in memory small
            con.execute(
                f"""
                COPY (
                    WITH m AS (
                        SELECT h3_res7, ym, sensor, ANY_VALUE(center_lat) AS lat, ANY_VALUE(center_lon) AS lon, bit_or(days_mask) AS mask
                        FROM read_parquet('{_q(hex_dir)}/ym={y}-*/*.parquet', hive_partitioning = true, hive_types = {{'ym': 'VARCHAR'}})
                        GROUP BY h3_res7, ym, sensor
                    )
                    SELECT CAST(floor(lat / {BIN_DEG}) * {BIN_DEG} + {BIN_DEG / 2} AS FLOAT) AS bin_lat,
                           CAST(floor(lon / {BIN_DEG}) * {BIN_DEG} + {BIN_DEG / 2} AS FLOAT) AS bin_lon,
                           ym, sensor, CAST(SUM(bit_count(mask)) AS INTEGER) AS days, CAST(COUNT(*) AS INTEGER) AS cells
                    FROM m GROUP BY 1, 2, 3, 4
                ) TO '{_q(Path(tmp) / f'{y}.parquet')}' (FORMAT PARQUET, COMPRESSION ZSTD)
                """
            )
            print(f"  {y}: done", flush=True)
        con.execute(
            f"COPY (SELECT * FROM read_parquet('{_q(tmp)}/*.parquet') ORDER BY bin_lat, bin_lon, ym, sensor) "
            f"TO '{_q(dest)}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)"
        )
        n = con.execute(f"SELECT COUNT(*) FROM read_parquet('{_q(dest)}')").fetchone()[0]
        con.close()
    return int(n)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hex", required=True, help="the hex folder built by build_hex_months.py")
    ap.add_argument("--memory", default="4GB")
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()
    print(f"{build_monthly_bins(Path(a.hex), a.memory, a.threads)} rows in {Path(a.hex) / 'monthly_bins.parquet'}")
