"""Read-only data access. DuckDB queries Parquet files straight from disk (or later from object storage).

Nothing here fits a model or reads raw FIRMS CSV: the data team computes harmonization offline and ships the result as
Parquet (docs/DATA_CONTRACT.md). The API only filters, sums and returns it.
"""
import calendar
import json
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any

import duckdb

from .schemas import Bbox, DataMeta

REQUIRED = ("monthly.parquet", "daily.parquet", "points.parquet", "meta.json")
SERIES_COLUMN = {"harmonized": "harmonized", "modis": "modis_raw", "viirs": "viirs_raw"}
# The harmonized series is MODIS before this month and S-NPP VIIRS from it (the data team's method).
HARMONIZE_FROM = "2012-02"  # S-NPP (the only VIIRS satellite used) flies from 20 January 2012, so February is its first full month
# Aqua joined Terra in July 2002. Before that MODIS is Terra alone, which sees only about a quarter of what both see (it flies in
# the morning, when fires are few), so those months carry no combined value instead of reading as "little fire".
AQUA_START = "2002-07"
# Months used to fit the MODIS -> VIIRS factors (the overlap years the data team calibrated on).
FIT_START, FIT_END = "2012-02", "2022-12"
HEX_METHOD = (
    "Before February 2012 MODIS cell-days are multiplied by a per-month factor, fitted where MODIS and VIIRS both have data (2012-02 to 2022-12), "
    "onto the VIIRS scale; from February 2012 S-NPP VIIRS is used as is. Static land sources and low-confidence points are removed."
)
# Areas at least this many degrees wide and high read the pre-added 0.25 degree table; smaller ones stay exact.
BINS_MIN_SPAN = 2.0
HEX_SOURCE = "NASA FIRMS MODIS and VIIRS, aggregated to H3 res7 cell-days by the data team"


def parent_cell(column: str, res: int) -> str:
    """SQL for the H3 parent at `res` (3..7) of a res7 cell held as a hex string.

    An H3 index is [1 reserved][4 mode][3 reserved][4 resolution][7 base cell][15 three-bit digits]. The parent sets the
    resolution field to `res` and turns every digit after the res-th into 7. (Checked against the h3 library in the tests.)
    """
    if res == 7:
        return column
    return f"lower(hex(((((('0x' || {column})::UBIGINT) & ~(15::UBIGINT << 52)) | ({int(res)}::UBIGINT << 52)) | ((1::UBIGINT << {3 * (15 - int(res))}) - 1))))"


class DataError(RuntimeError):
    """The data folder is missing or incomplete."""


class Store:
    def __init__(self, data_dir: Path, series_from_hex: bool = False, raw_dir: Path | None = None):
        # With the series computed from the hex files (the real data) none of the sample tables is needed.
        missing = [] if series_from_hex else [f for f in REQUIRED if not (data_dir / f).exists()]
        if missing:
            raise DataError(
                f"{data_dir} is missing {', '.join(missing)}. "
                "Create sample data with: python scripts/make_sample_data.py"
            )
        self.data_dir = data_dir
        self.raw_dir = raw_dir
        # Slim cell-day table (scripts/build_cells.py): what the temperature map and the cells CSV read. Without it they read raw_dir.
        self.cells_dir = data_dir / "cells" if any((data_dir / "cells").glob("ym=*")) else None
        self._meta: DataMeta | None = None if series_from_hex else DataMeta.model_validate(json.loads((data_dir / "meta.json").read_text(encoding="utf-8")))
        # Optional per-month hex files built by scripts/build_hex_months.py from the data team's world H3 parquet.
        self.hex_dir = data_dir / "hex" if any((data_dir / "hex").glob("ym=*")) else None
        self._series_cache: dict[tuple, tuple] = {}
        # Optional pre-added table (scripts/build_monthly_bins.py): the monthly series of a big area without scanning every hex file.
        bins = data_dir / "hex" / "monthly_bins.parquet"
        self._bins = bins if bins.exists() else None
        if series_from_hex and self.hex_dir is None:
            raise DataError(f"SERIES_SOURCE=hex needs hex files in {data_dir / 'hex'} (see scripts/build_hex_months.py).")
        self._hex_series = series_from_hex
        if self._hex_series:
            self._meta = self._hex_meta()
        self.con = duckdb.connect(":memory:")
        self.has_points = not series_from_hex  # raw detections exist only in the sample tables, not in the real data
        for name in () if series_from_hex else ("monthly", "daily", "points"):
            path = (data_dir / f"{name}.parquet").as_posix().replace("'", "''")
            self.con.execute(f"CREATE VIEW {name} AS SELECT * FROM read_parquet('{path}')")
        # Optional weekly table for the analog-years feature, built by scripts/build_analog_weekly.py.
        self.analog_meta: dict | None = None
        analog_file, analog_json = data_dir / "analog_weekly.parquet", data_dir / "analog_meta.json"
        if analog_file.exists() and analog_json.exists():
            self.analog_meta = json.loads(analog_json.read_text(encoding="utf-8"))
            path = analog_file.as_posix().replace("'", "''")
            self.con.execute(f"CREATE VIEW analog_weekly AS SELECT * FROM read_parquet('{path}')")
        self._analog_cache: dict[tuple, dict] = {}

    # ---- helpers -------------------------------------------------------------------------------------------
    def _rows(self, sql: str, params: list[Any]) -> list[dict[str, Any]]:
        cur = self.con.cursor()  # one cursor per call: safe under FastAPI's thread pool
        try:
            cur.execute(sql, params)
            names = [d[0] for d in cur.description]
            return [dict(zip(names, r)) for r in cur.fetchall()]
        finally:
            cur.close()

    @staticmethod
    def _box(b: Bbox) -> list[float]:
        return [b.south, b.north, b.west, b.east]

    # ---- series from the hex files ------------------------------------------------------------------------
    def _hex_months(self) -> list[str]:
        return sorted(d.name[3:] for d in self.hex_dir.glob("ym=*") if any(d.glob("*.parquet")))  # type: ignore[union-attr]

    def _hex_meta(self) -> DataMeta:
        months = self._hex_months()
        newest = max(f.stat().st_mtime for f in self.hex_dir.glob("ym=*/*.parquet"))  # type: ignore[union-attr]
        return DataMeta.model_validate(
            {
                "version": f"hex-{months[-1]}",
                "method": HEX_METHOD,
                "source": HEX_SOURCE,
                "gridDeg": 0.0,
                "updated": date.fromtimestamp(newest).isoformat(),
                "firstMonth": months[0],
                "lastMonth": months[-1],
                "isMock": False,
            }
        )

    def _series(self, b: Bbox) -> tuple[dict[str, dict[str, tuple[int, int]]], dict[int, float], float | None]:
        """Cell-days and cells per month and sensor inside the box, plus the MODIS -> VIIRS factors fitted on the overlap years."""
        key = tuple(self._box(b))
        if key in self._series_cache:
            return self._series_cache[key]
        if self._bins is not None and b.north - b.south >= BINS_MIN_SPAN and b.east - b.west >= BINS_MIN_SPAN:
            path = self._bins.as_posix().replace("'", "''")
            rows = self._rows(
                f"""
                SELECT ym, sensor, CAST(SUM(days) AS BIGINT) AS days, CAST(SUM(cells) AS BIGINT) AS cells
                FROM read_parquet('{path}')
                WHERE bin_lat BETWEEN ? AND ? AND bin_lon BETWEEN ? AND ?
                GROUP BY ym, sensor
                """,
                self._box(b),
            )
        else:
            glob = (self.hex_dir / "ym=*" / "*.parquet").as_posix().replace("'", "''")  # type: ignore[operator]
            rows = self._rows(
                f"""
                WITH m AS (
                    SELECT h3_res7, ym, sensor, bit_or(days_mask) AS mask
                    FROM read_parquet('{glob}', hive_partitioning = true, hive_types = {{'ym': 'VARCHAR'}})
                    WHERE center_lat BETWEEN ? AND ? AND center_lon BETWEEN ? AND ?
                    GROUP BY h3_res7, ym, sensor
                )
                SELECT ym, sensor, CAST(SUM(bit_count(mask)) AS BIGINT) AS days, COUNT(*) AS cells FROM m GROUP BY ym, sensor
                """,
                self._box(b),
            )
        by: dict[str, dict[str, tuple[int, int]]] = {}
        for r in rows:
            by.setdefault(r["ym"], {})[r["sensor"]] = (int(r["days"]), int(r["cells"]))
        per_month = {m: [0, 0] for m in range(1, 13)}
        total = [0, 0]
        for ym, s in by.items():
            if FIT_START <= ym <= FIT_END and "modis" in s and "viirs" in s:
                m = int(ym[5:])
                for acc in (per_month[m], total):
                    acc[0] += s["modis"][0]
                    acc[1] += s["viirs"][0]
        factors = {m: v / mo for m, (mo, v) in per_month.items() if mo > 0 and v > 0}
        fallback = total[1] / total[0] if total[0] > 0 and total[1] > 0 else None
        if len(self._series_cache) > 64:
            self._series_cache.clear()
        self._series_cache[key] = (by, factors, fallback)
        return by, factors, fallback

    def _monthly_from_files(self, b: Bbox) -> list[dict[str, Any]]:
        by, factors, fallback = self._series(b)
        out = []
        for ym in sorted(by):
            s = by[ym]
            month = int(ym[5:])
            modis = s["modis"][0] if "modis" in s else None
            viirs = s["viirs"][0] if "viirs" in s else None
            scaled = ym < HARMONIZE_FROM
            factor = factors.get(month, fallback) if scaled and ym >= AQUA_START else None
            if scaled:
                value = None if modis is None or factor is None else round(modis * factor, 1)
                cells = s["modis"][1] if "modis" in s else 0
            else:
                value = None if viirs is None else float(viirs)
                cells = s["viirs"][1] if "viirs" in s else 0
            out.append(
                {
                    "yearMonth": ym,
                    "year": int(ym[:4]),
                    "month": month,
                    "modis": None if modis is None else float(modis),
                    "viirs": None if viirs is None else float(viirs),
                    "harmonized": value,
                    "cells": cells,
                    "anyNrt": False,
                    "allInCalibration": FIT_START <= ym <= FIT_END,
                    "methods": ["modis_scaled" if scaled else "viirs_native"],
                    "scaleFactor": None if factor is None else round(factor, 3),
                }
            )
        return out

    def _daily_from_files(self, b: Bbox, ym: str) -> list[dict[str, Any]]:
        files = sorted((self.hex_dir / f"ym={ym}").glob("*.parquet"))  # type: ignore[operator]
        if not files:
            return []
        flist = ", ".join("'" + f.as_posix().replace("'", "''") + "'" for f in files)
        rows = self._rows(
            f"""
            SELECT t.d AS day, sensor, CAST(SUM((mask >> (t.d - 1)) & 1) AS INTEGER) AS n
            FROM (
                SELECT h3_res7, sensor, bit_or(days_mask) AS mask FROM read_parquet([{flist}])
                WHERE center_lat BETWEEN ? AND ? AND center_lon BETWEEN ? AND ?
                GROUP BY h3_res7, sensor
            ) m, generate_series(1, 31) AS t(d)
            GROUP BY t.d, sensor
            """,
            self._box(b),
        )
        counts: dict[str, dict[int, int]] = {}
        for r in rows:
            counts.setdefault(r["sensor"], {})[int(r["day"])] = int(r["n"])
        _, factors, fallback = self._series(b)
        month = int(ym[5:])
        factor = None if ym < AQUA_START else factors.get(month, fallback)
        out = []
        for d in range(1, calendar.monthrange(int(ym[:4]), month)[1] + 1):
            modis = float(counts["modis"].get(d, 0)) if "modis" in counts else None
            viirs = float(counts["viirs"].get(d, 0)) if "viirs" in counts else None
            if ym < HARMONIZE_FROM:
                harmonized = None if modis is None or factor is None else round(modis * factor, 1)
            else:
                harmonized = viirs
            out.append({"day": d, "modis": modis, "viirs": viirs, "harmonized": harmonized})
        return out

    # ---- queries -------------------------------------------------------------------------------------------
    def meta(self) -> DataMeta:
        assert self._meta is not None
        return self._meta

    def monthly(self, b: Bbox) -> list[dict[str, Any]]:
        """One row per month, summed over the grid cells whose centre lies inside the box."""
        if self._hex_series:
            return self._monthly_from_files(b)
        return self._rows(
            """
            SELECT year_month AS "yearMonth",
                   CAST(year_month[1:4] AS INTEGER) AS year,
                   CAST(year_month[6:7] AS INTEGER) AS month,
                   CAST(SUM(modis_raw) AS DOUBLE) AS modis,
                   CAST(SUM(viirs_raw) AS DOUBLE) AS viirs,
                   ROUND(CAST(SUM(harmonized) AS DOUBLE), 1) AS harmonized,
                   COUNT(DISTINCT cell_id) AS cells,
                   BOOL_OR(data_status = 'nrt') AS "anyNrt",
                   BOOL_AND(in_calibration) AS "allInCalibration",
                   list_sort(list(DISTINCT method)) AS methods,
                   ROUND(AVG(scale_factor), 3) AS "scaleFactor"
            FROM monthly
            WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
            GROUP BY year_month
            ORDER BY year_month
            """,
            self._box(b),
        )

    def daily(self, b: Bbox, year_month: str) -> list[dict[str, Any]]:
        if self._hex_series:
            return self._daily_from_files(b, year_month)
        return self._rows(
            """
            SELECT CAST(day(date) AS INTEGER) AS day,
                   CAST(SUM(modis_raw) AS DOUBLE) AS modis,
                   CAST(SUM(viirs_raw) AS DOUBLE) AS viirs,
                   ROUND(CAST(SUM(harmonized) AS DOUBLE), 1) AS harmonized
            FROM daily
            WHERE ym = ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
            GROUP BY day(date)
            ORDER BY day(date)
            """,
            [year_month, *self._box(b)],
        )

    def points(self, b: Bbox, year_month: str, sensors: list[str], day: int | None, limit: int) -> tuple[list[dict], int]:
        """Raw detections for one month (or one day). Returns (a deterministic sample of at most `limit`, true total)."""
        if not self.has_points:
            raise DataError("Raw detection points are not part of the real data (it is aggregated to H3 cells).")
        where = "ym = ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND sensor IN (SELECT UNNEST(?))"
        params: list[Any] = [year_month, *self._box(b), sensors]
        if day is not None:
            where += " AND day(date) = ?"
            params.append(day)
        total = self._rows(f"SELECT COUNT(*) AS n FROM points WHERE {where}", params)[0]["n"]
        # Ordering by a hash gives a stable, evenly spread sample, so the map does not flicker between requests.
        rows = self._rows(
            f"SELECT lat, lon, sensor FROM points WHERE {where} ORDER BY hash(lat, lon, date) LIMIT ?",
            [*params, limit],
        )
        return rows, int(total)

    def hexes(self, b: Bbox, start: str, end: str, sensors: list[str], day: int | None, limit: int, res: int = 7) -> dict[str, Any]:
        """Detections of a period (or one day of a month) grouped into H3 cells of resolution `res`, busiest first, at most `limit`.

        A cell's `days` adds up the days with a detection of every res7 cell inside it (cell-days), so no cell-day is lost
        when the cells are merged. `total` is the number of hexagons, `used` how many came back.
        """
        if self.hex_dir is not None:
            return self._hexes_from_files(b, start, end, sensors, day, limit, res)
        where = "ym BETWEEN ? AND ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND sensor IN (SELECT UNNEST(?))"
        params: list[Any] = [start, end, *self._box(b), sensors]
        if day is not None:
            where += " AND day(date) = ?"
            params.append(day)
        rows = self._rows(
            f"""
            WITH c AS (
                SELECT h3_res7, COUNT(DISTINCT date) AS days FROM points WHERE {where} GROUP BY h3_res7
            )
            SELECT {parent_cell('h3_res7', res)} AS h3, CAST(SUM(days) AS INTEGER) AS days, COUNT(*) OVER () AS total
            FROM c
            GROUP BY 1
            ORDER BY days DESC, h3
            LIMIT ?
            """,
            [*params, limit],
        )
        return {"cells": [{"h3": r["h3"], "days": r["days"]} for r in rows], "total": int(rows[0]["total"]) if rows else 0, "used": len(rows)}

    def _hexes_from_files(self, b: Bbox, start: str, end: str, sensors: list[str], day: int | None, limit: int, res: int = 7) -> dict[str, Any]:
        dirs = sorted(d for d in self.hex_dir.glob("ym=*") if start <= d.name[3:] <= end and any(d.glob("*.parquet")))  # type: ignore[union-attr]
        if not dirs:
            return {"cells": [], "total": 0, "used": 0}
        files = ", ".join("'" + f.as_posix().replace("'", "''") + "'" for d in dirs for f in sorted(d.glob("*.parquet")))
        if set(sensors) == {"modis", "viirs"}:  # the harmonized series: one sensor per month, never both
            sensor_cond = f"((sensor = 'modis' AND ym < '{HARMONIZE_FROM}') OR (sensor = 'viirs' AND ym >= '{HARMONIZE_FROM}'))"
        else:
            sensor_cond = "sensor IN (" + ", ".join(f"'{x}'" for x in sensors if x in ("modis", "viirs")) + ")"
        where = f"center_lat BETWEEN ? AND ? AND center_lon BETWEEN ? AND ? AND {sensor_cond}"
        params: list[Any] = [*self._box(b)]
        if day is not None:
            where += " AND ((days_mask >> ?) & 1) = 1"
            params.append(day - 1)
        days_expr = "1" if day is not None else "bit_count(mask)"
        rows = self._rows(
            f"""
            WITH m AS (
                SELECT h3_res7, ym, bit_or(days_mask) AS mask
                FROM read_parquet([{files}], hive_partitioning = true, hive_types = {{'ym': 'VARCHAR'}})
                WHERE {where}
                GROUP BY h3_res7, ym
            )
            SELECT {parent_cell('h3_res7', res)} AS h3, CAST(SUM({days_expr}) AS INTEGER) AS days, COUNT(*) OVER () AS total
            FROM m
            GROUP BY 1
            ORDER BY days DESC, h3
            LIMIT ?
            """,
            [*params, limit],
        )
        return {"cells": [{"h3": r["h3"], "days": r["days"]} for r in rows], "total": int(rows[0]["total"]) if rows else 0, "used": len(rows)}

    def export_monthly(self, b: Bbox, start: str, end: str, limit: int) -> list[dict[str, Any]]:
        return [r for r in self.monthly(b) if start <= r["yearMonth"] <= end][:limit]

    def export_daily(self, b: Bbox, start: str, end: str, limit: int) -> Iterator[dict[str, Any]]:
        if self._hex_series:
            n = 0
            for ym in (m for m in self._hex_months() if start <= m <= end):
                for d in self._daily_from_files(b, ym):
                    if n >= limit:
                        return
                    n += 1
                    yield {"date": f"{ym}-{d['day']:02d}", "modis_raw": d["modis"], "viirs_raw": d["viirs"], "harmonized": d["harmonized"]}
            return
        rows = self._rows(
            """
            SELECT strftime(date, '%Y-%m-%d') AS date,
                   CAST(SUM(modis_raw) AS DOUBLE) AS modis_raw,
                   CAST(SUM(viirs_raw) AS DOUBLE) AS viirs_raw,
                   ROUND(CAST(SUM(harmonized) AS DOUBLE), 1) AS harmonized
            FROM daily
            WHERE ym BETWEEN ? AND ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
            GROUP BY date
            ORDER BY date
            LIMIT ?
            """,
            [start, end, *self._box(b), limit],
        )
        yield from rows

    @property
    def has_cells(self) -> bool:
        """Whether the per-cell temperatures can be answered (from the slim table or the per-year files)."""
        return self.cells_dir is not None or self.raw_dir is not None

    @staticmethod
    def _sensor_sql(sensors: list[str]) -> str:
        """Filter on the raw files' columns for the satellites a series uses (S-NPP as VIIRS, MODIS estimated onto the VIIRS scale)."""
        viirs = "(record_origin = 'OBSERVED_VIIRS' AND source_platform = 'S-NPP')"
        modis = "(record_origin <> 'OBSERVED_VIIRS')"
        return " OR ".join(sorted({"viirs": viirs, "modis": modis}[x] for x in sensors if x in ("modis", "viirs"))) or "FALSE"

    def temps(self, b: Bbox, start: str, end: str, sensors: list[str], limit: int) -> dict[str, Any]:
        """Hottest mid-infrared brightness temperature (bright_mir, Celsius) per res7 cell between two dates of one year (ISO strings).

        One row per cell: several satellites and the day and night passes of a date are reduced to the hottest reading. Same filters
        as the hexagon files: vegetation fires only (type 0), low-confidence points removed, and only the satellites the series uses
        (S-NPP as VIIRS, MODIS estimated onto the VIIRS scale; NOAA-20 is left out). Read from the slim table when it is there,
        otherwise straight from the data team's per-year file.
        """
        if not self.has_cells:
            raise DataError("There is no temperature data (neither the cells table nor RAW_DIR).")
        empty = {"cells": [], "total": 0, "used": 0, "metric": "bright_mir"}
        if start[:4] != end[:4]:
            return empty
        if self.cells_dir is not None:
            if not any(self.cells_dir.glob(f"ym={start[:4]}-*")):
                return empty
            src = f"read_parquet('{self._q(self.cells_dir)}/ym={start[:4]}-*/*.parquet')"
            sensor_in = ", ".join(f"'{x}'" for x in sensors if x in ("modis", "viirs")) or "''"
            select = "h3_res7 AS h3, CAST(MAX(temp_c) AS DOUBLE) AS temp_c, CAST(SUM(n) AS INTEGER) AS n, COUNT(*) OVER () AS total"
            where = f"acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE) AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND sensor IN ({sensor_in})"
        else:
            file = self.raw_dir / f"{start[:4]}.parquet"  # type: ignore[operator]
            if not file.exists():
                return empty
            src = f"read_parquet('{self._q(file)}')"
            select = "h3_res7 AS h3, CAST(MAX(bright_mir) AS DOUBLE) - 273.15 AS temp_c, CAST(COUNT(*) AS INTEGER) AS n, COUNT(*) OVER () AS total"
            where = (
                "acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE) AND center_lat BETWEEN ? AND ? AND center_lon BETWEEN ? AND ? "
                f"AND COALESCE(type, 0) = 0 AND (point_count - COALESCE(conf_l, 0)) > 0 AND ({self._sensor_sql(sensors)})"
            )
        # The slim table is ordered by date and latitude, so a day or a small box skips most of it.
        rows = self._rows(
            f"SELECT {select} FROM {src} WHERE {where} GROUP BY h3_res7 ORDER BY temp_c DESC, h3 LIMIT ?",
            [start, end, *self._box(b), limit],
        )
        cells = [{"h3": r["h3"], "temp_c": round(r["temp_c"], 1), "n": r["n"]} for r in rows]
        return {"cells": cells, "total": int(rows[0]["total"]) if rows else 0, "used": len(cells), "metric": "bright_mir"}

    @staticmethod
    def _q(path: Path) -> str:
        return path.as_posix().replace("'", "''")

    def export_cells(self, b: Bbox, start: str, end: str, sensors: list[str], limit: int) -> list[dict[str, Any]]:
        """Every cell-day with a detection between two months (YYYY-MM, inclusive) inside the box: the date, the cell and its centre,
        the hottest mid-infrared temperature (bright_mir, Celsius), the strongest fire power and how many observations there
        were. Same filters as `temps`. At most `limit` rows, oldest first."""
        if not self.has_cells:
            raise DataError("There is no hotspot data (neither the cells table nor RAW_DIR).")
        out: list[dict[str, Any]] = []
        for year in range(int(start[:4]), int(end[:4]) + 1):
            if len(out) >= limit:
                break
            first = f"{year}-{start[5:]}-01" if year == int(start[:4]) else f"{year}-01-01"
            last_month = int(end[5:]) if year == int(end[:4]) else 12
            last = f"{year}-{last_month:02d}-{calendar.monthrange(year, last_month)[1]:02d}"
            if self.cells_dir is not None:
                if not any(self.cells_dir.glob(f"ym={year}-*")):
                    continue
                sensor_in = ", ".join(f"'{x}'" for x in sensors if x in ("modis", "viirs")) or "''"
                query = f"""
                    SELECT strftime(acq_date, '%Y-%m-%d') AS date, h3_res7 AS h3,
                           ROUND(CAST(ANY_VALUE(lat) AS DOUBLE), 4) AS lat, ROUND(CAST(ANY_VALUE(lon) AS DOUBLE), 4) AS lon,
                           ROUND(CAST(MAX(temp_c) AS DOUBLE), 1) AS temp_c, ROUND(CAST(MAX(frp_mw) AS DOUBLE), 1) AS frp_mw,
                           CAST(SUM(n) AS INTEGER) AS n
                    FROM read_parquet('{self._q(self.cells_dir)}/ym={year}-*/*.parquet')
                    WHERE acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE) AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
                      AND sensor IN ({sensor_in})
                    GROUP BY acq_date, h3_res7 ORDER BY acq_date, h3_res7 LIMIT ?
                    """
            else:
                file = self.raw_dir / f"{year}.parquet"  # type: ignore[operator]
                if not file.exists():
                    continue
                query = f"""
                    SELECT strftime(acq_date, '%Y-%m-%d') AS date, h3_res7 AS h3,
                           ROUND(CAST(ANY_VALUE(center_lat) AS DOUBLE), 4) AS lat, ROUND(CAST(ANY_VALUE(center_lon) AS DOUBLE), 4) AS lon,
                           ROUND(CAST(MAX(bright_mir) AS DOUBLE) - 273.15, 1) AS temp_c, ROUND(CAST(MAX(frp) AS DOUBLE), 1) AS frp_mw,
                           CAST(COUNT(*) AS INTEGER) AS n
                    FROM read_parquet('{self._q(file)}')
                    WHERE acq_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
                      AND center_lat BETWEEN ? AND ? AND center_lon BETWEEN ? AND ?
                      AND COALESCE(type, 0) = 0 AND (point_count - COALESCE(conf_l, 0)) > 0 AND ({self._sensor_sql(sensors)})
                    GROUP BY acq_date, h3_res7 ORDER BY acq_date, h3_res7 LIMIT ?
                    """
            out.extend(self._rows(query, [first, last, *self._box(b), limit - len(out)]))
        return out

    def analog_weeks(self, b: Bbox) -> dict[int, dict[int, tuple[float, float, float, float, int]]]:
        """Weekly sums per year inside the box (bins whose centre lies in it): year -> week -> (frp, score, temp, conf, cell-days)."""
        if self.analog_meta is None:
            return {}
        key = tuple(self._box(b))
        if key in self._analog_cache:
            return self._analog_cache[key]
        rows = self._rows(
            """
            SELECT year, week, SUM(sum_frp) AS f, SUM(sum_score) AS s, SUM(sum_temp) AS t, SUM(sum_conf) AS c, SUM(n_cells) AS n
            FROM analog_weekly
            WHERE bin_lat BETWEEN ? AND ? AND bin_lon BETWEEN ? AND ?
            GROUP BY year, week
            """,
            self._box(b),
        )
        out: dict[int, dict[int, tuple[float, float, float, float, int]]] = {}
        for r in rows:
            out.setdefault(int(r["year"]), {})[int(r["week"])] = (float(r["f"]), float(r["s"]), float(r["t"]), float(r["c"]), int(r["n"]))
        if len(self._analog_cache) > 32:
            self._analog_cache.clear()
        self._analog_cache[key] = out
        return out
