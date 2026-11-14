"""Read-only data access. DuckDB queries Parquet files straight from disk (or later from object storage).

Nothing here fits a model or reads raw FIRMS CSV: the data team computes harmonization offline and ships the result as
Parquet (docs/DATA_CONTRACT.md). The API only filters, sums and returns it.
"""
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import duckdb

from .schemas import Bbox, DataMeta

REQUIRED = ("monthly.parquet", "daily.parquet", "points.parquet", "meta.json")
SERIES_COLUMN = {"harmonized": "harmonized", "modis": "modis_raw", "viirs": "viirs_raw"}
# The harmonized series is MODIS before this month and S-NPP VIIRS from it (the data team's method).
HARMONIZE_FROM = "2013-01"


class DataError(RuntimeError):
    """The data folder is missing or incomplete."""


class Store:
    def __init__(self, data_dir: Path):
        missing = [f for f in REQUIRED if not (data_dir / f).exists()]
        if missing:
            raise DataError(
                f"{data_dir} is missing {', '.join(missing)}. "
                "Create sample data with: python scripts/make_sample_data.py"
            )
        self.data_dir = data_dir
        self._meta = DataMeta.model_validate(json.loads((data_dir / "meta.json").read_text(encoding="utf-8")))
        # Optional per-month hex files built by scripts/build_hex_months.py from the data team's world H3 parquet.
        self.hex_dir = data_dir / "hex" if any((data_dir / "hex").glob("ym=*")) else None
        self.con = duckdb.connect(":memory:")
        for name in ("monthly", "daily", "points"):
            path = (data_dir / f"{name}.parquet").as_posix().replace("'", "''")
            self.con.execute(f"CREATE VIEW {name} AS SELECT * FROM read_parquet('{path}')")

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

    # ---- queries -------------------------------------------------------------------------------------------
    def meta(self) -> DataMeta:
        return self._meta

    def monthly(self, b: Bbox) -> list[dict[str, Any]]:
        """One row per month, summed over the grid cells whose centre lies inside the box."""
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

    def hexes(self, b: Bbox, year_month: str, sensors: list[str], day: int | None, limit: int) -> dict[str, Any]:
        """Detections of one month (or day) grouped into H3 res7 cells, busiest first, at most `limit` cells."""
        if self.hex_dir is not None:
            return self._hexes_from_files(b, year_month, sensors, day, limit)
        where = "ym = ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND sensor IN (SELECT UNNEST(?))"
        params: list[Any] = [year_month, *self._box(b), sensors]
        if day is not None:
            where += " AND day(date) = ?"
            params.append(day)
        total = int(self._rows(f"SELECT COUNT(DISTINCT h3_res7) AS n FROM points WHERE {where}", params)[0]["n"])
        rows = self._rows(
            f"""
            SELECT h3_res7 AS h3, CAST(COUNT(DISTINCT date) AS INTEGER) AS days, COUNT(*) AS n
            FROM points WHERE {where}
            GROUP BY h3_res7
            ORDER BY days DESC, n DESC, h3_res7
            LIMIT ?
            """,
            [*params, limit],
        )
        return {"cells": [{"h3": r["h3"], "days": r["days"]} for r in rows], "total": total, "used": len(rows)}

    def _hexes_from_files(self, b: Bbox, year_month: str, sensors: list[str], day: int | None, limit: int) -> dict[str, Any]:
        month_dir = self.hex_dir / f"ym={year_month}"  # type: ignore[operator]
        if not any(month_dir.glob("*.parquet")):
            return {"cells": [], "total": 0, "used": 0}
        if set(sensors) == {"modis", "viirs"}:  # the harmonized series: one sensor per period, never both
            sensors = ["modis"] if year_month < HARMONIZE_FROM else ["viirs"]
        src = (month_dir / "*.parquet").as_posix().replace("'", "''")
        where = "center_lat BETWEEN ? AND ? AND center_lon BETWEEN ? AND ? AND sensor IN (SELECT UNNEST(?))"
        params: list[Any] = [*self._box(b), sensors]
        if day is not None:
            where += " AND ((days_mask >> ?) & 1) = 1"
            params.append(day - 1)
        days_expr = "1" if day is not None else "bit_count(bit_or(days_mask))"
        total = self._rows(f"SELECT COUNT(DISTINCT h3_res7) AS n FROM read_parquet('{src}') WHERE {where}", params)[0]["n"]
        rows = self._rows(
            f"""
            SELECT h3_res7 AS h3, CAST({days_expr} AS INTEGER) AS days, CAST(SUM(points) AS BIGINT) AS n
            FROM read_parquet('{src}') WHERE {where}
            GROUP BY h3_res7
            ORDER BY days DESC, n DESC, h3_res7
            LIMIT ?
            """,
            [*params, limit],
        )
        return {"cells": [{"h3": r["h3"], "days": r["days"]} for r in rows], "total": int(total), "used": len(rows)}

    def export_monthly(self, b: Bbox, start: str, end: str, limit: int) -> list[dict[str, Any]]:
        return [r for r in self.monthly(b) if start <= r["yearMonth"] <= end][:limit]

    def export_daily(self, b: Bbox, start: str, end: str, limit: int) -> Iterator[dict[str, Any]]:
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
