"""Add the per-month hex files up into one row per cell and year, so a map of many years answers in about a second.

    python scripts/build_cell_years.py --hex C:/nasa-data/hex

Writes <hex>/cell_years.parquet with h3_res7, country, year, lat, lon and `days`: the days with a detection in that cell and year under the
combined series' rule (MODIS estimated before 2012-02, S-NPP VIIRS from then on, one sensor per month). Rows are ordered by latitude in
row groups of 100,000, so a box skips most of the file. The API uses it for the combined series over whole calendar years and reads the
month files for the rest. Run it again whenever the hex files change.
"""
import argparse
import sys
import tempfile
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.store import HARMONIZE_FROM  # noqa: E402


def _q(path: Path | str) -> str:
    return str(path).replace("\\", "/").replace("'", "''")


def build_cell_years(hex_dir: Path, memory: str = "4GB", threads: int = 4) -> int:
    hex_dir = Path(hex_dir)
    months = sorted(p.name.removeprefix("ym=") for p in hex_dir.glob("ym=*") if p.is_dir())
    if not months:
        raise SystemExit(f"No ym=YYYY-MM folders in {hex_dir}")
    dest = hex_dir / "cell_years.parquet"
    with tempfile.TemporaryDirectory(dir=hex_dir) as tmp:
        con = duckdb.connect()
        con.execute(f"SET threads={int(threads)}; SET memory_limit='{memory}'; SET temp_directory='{_q(Path(tmp) / 'spill')}'")
        for y in sorted({m[:4] for m in months}):
            con.execute(
                f"""
                COPY (
                    WITH m AS (
                        SELECT h3_res7, country, ym, bit_or(days_mask) AS mask, ANY_VALUE(center_lat) AS lat, ANY_VALUE(center_lon) AS lon
                        FROM read_parquet('{_q(hex_dir)}/ym={y}-*/*.parquet', hive_partitioning = true, hive_types = {{'ym': 'VARCHAR'}})
                        WHERE (sensor = 'modis' AND ym < '{HARMONIZE_FROM}') OR (sensor = 'viirs' AND ym >= '{HARMONIZE_FROM}')
                        GROUP BY h3_res7, country, ym
                    )
                    SELECT h3_res7, country, CAST({y} AS SMALLINT) AS year, ANY_VALUE(lat) AS lat, ANY_VALUE(lon) AS lon,
                           CAST(SUM(bit_count(mask)) AS SMALLINT) AS days
                    FROM m GROUP BY h3_res7, country
                ) TO '{_q(Path(tmp) / f'{y}.parquet')}' (FORMAT PARQUET, COMPRESSION ZSTD)
                """
            )
            print(f"  {y}: done", flush=True)
        con.execute(
            f"COPY (SELECT * FROM read_parquet('{_q(tmp)}/*.parquet') ORDER BY lat, lon) "
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
    print(f"{build_cell_years(Path(a.hex), a.memory, a.threads)} rows in {Path(a.hex) / 'cell_years.parquet'}")
