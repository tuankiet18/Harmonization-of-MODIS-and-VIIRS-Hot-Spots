"""Build everything the API needs from the data team's per-year files, in one command.

    python scripts/build_final_data.py --src C:/nasa-data/harmonize_final --out C:/nasa-data/final

`--src` is a folder with 2000.parquet ... 2025.parquet (unzip the Drive download first). `--out` becomes the API's DATA_DIR:

    <out>/hex/ym=YYYY-MM/*.parquet   per-month hexagon files   (build_hex_months.py)  the map, the monthly and daily series
    <out>/hex/monthly_bins.parquet   pre-added monthly table    (build_monthly_bins.py) the monthly series of big areas in milliseconds
    <out>/hex/cell_years.parquet     per cell and year          (build_cell_years.py)   the Overview map over whole years
    <out>/cells/ym=YYYY-MM/*.parquet slim cell-day table        (build_cells.py)       the temperature map and the cells CSV
    <out>/analog_weekly.parquet      weekly table + analog_meta.json (build_analog_weekly.py)  the Similar years tab

Run it with SERIES_SOURCE=hex and DATA_DIR=<out>; none of the demo tables are needed. About 15 GB of input takes roughly 30 to
60 minutes and needs about 3 GB of free space for the output plus temporary files. Steps can be run alone with --only, and
a few years alone with --years (handy to try it out).
"""
import argparse
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_analog_weekly import build_real  # noqa: E402
from build_cell_years import build_cell_years  # noqa: E402
from build_cells import build_cells  # noqa: E402
from build_hex_months import build_hex_months  # noqa: E402
from build_monthly_bins import build_monthly_bins  # noqa: E402

STEPS = ("hex", "bins", "years", "cells", "analog")


def year_files(src: Path, years: list[int] | None) -> list[Path]:
    files = sorted(f for f in src.glob("*.parquet") if re.fullmatch(r"\d{4}\.parquet", f.name))
    if years:
        files = [f for f in files if int(f.stem) in years]
    if not files:
        raise SystemExit(f"No YYYY.parquet files in {src}")
    return files


def build_all(src: Path, out: Path, steps: tuple[str, ...] = STEPS, years: list[int] | None = None) -> None:
    files = year_files(src, years)
    out.mkdir(parents=True, exist_ok=True)

    def step(name: str, fn) -> None:
        t0 = time.time()
        print(f"[{name}] ...", flush=True)
        fn()
        print(f"[{name}] done in {time.time() - t0:.0f} s", flush=True)

    if "hex" in steps:
        step("hex", lambda: [build_hex_months(f.as_posix(), out / "hex") for f in files])
    if "bins" in steps:
        step("bins", lambda: print(f"  {build_monthly_bins(out / 'hex')} rows"))
    if "years" in steps:
        step("years", lambda: print(f"  {build_cell_years(out / 'hex')} rows"))
    if "cells" in steps:
        step("cells", lambda: [build_cells(f.as_posix(), out / "cells") for f in files])
    if "analog" in steps:
        step("analog", lambda: print(f"  {build_real(src, out, years)['rows']} rows"))
    print(f"Ready: DATA_DIR={out}  SERIES_SOURCE=hex")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, type=Path, help="folder with the per-year parquet files")
    ap.add_argument("--out", required=True, type=Path, help="the API's data folder (DATA_DIR)")
    ap.add_argument("--only", nargs="+", choices=STEPS, help="run only these steps")
    ap.add_argument("--years", nargs="+", type=int, help="only these years (to try it out)")
    a = ap.parse_args()
    build_all(a.src, a.out, tuple(a.only) if a.only else STEPS, a.years)
