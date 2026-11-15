import calendar
import time
from collections import defaultdict, deque
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from . import analog
from .config import Settings, get_settings
from .explain import build_facts, get_explainer
from .schemas import (
    AnalogResult,
    Bbox,
    DataMeta,
    DayPoint,
    ExplainRequest,
    ExplainResponse,
    HexSample,
    HotspotSample,
    MonthlyPoint,
    Source,
    TempSample,
)
from .store import DataError, Store

YM = r"^\d{4}-(0[1-9]|1[0-2])$"


def bbox_params(
    west: Annotated[float, Query(ge=-180, le=180)],
    south: Annotated[float, Query(ge=-90, le=90)],
    east: Annotated[float, Query(ge=-180, le=180)],
    north: Annotated[float, Query(ge=-90, le=90)],
) -> Bbox:
    if not (south < north and west < east):
        raise HTTPException(422, "Invalid box: south must be below north and west below east.")
    return Bbox(west=west, south=south, east=east, north=north)


class RateLimiter:
    """Sliding window per client, in memory. Enough for one instance; use Redis or the platform if you scale out."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, client: str) -> None:
        now = time.monotonic()
        q = self.hits[client]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.per_minute:
            raise HTTPException(429, "Too many requests. Try again in a minute.")
        q.append(now)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    store = Store(settings.data_dir, series_from_hex=settings.series_source == "hex", raw_dir=settings.raw_dir)
    explainer = get_explainer(settings.explain_provider)
    limiter = RateLimiter(settings.explain_rate_per_min)

    app = FastAPI(title="FireCalendar API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health")
    def health() -> dict[str, str | bool]:
        """Cheap liveness check. Open it before a demo to wake a sleeping instance."""
        return {"status": "ok", "isMock": store.meta().is_mock}

    @app.get("/api/meta", response_model=DataMeta, response_model_by_alias=True)
    def meta() -> DataMeta:
        return store.meta()

    @app.get("/api/monthly", response_model=list[MonthlyPoint], response_model_by_alias=True)
    def monthly(box: Annotated[Bbox, Depends(bbox_params)]):
        """Per-month totals for the box (what the calendar and trend chart need)."""
        return store.monthly(box)

    @app.get("/api/daily", response_model=list[DayPoint], response_model_by_alias=True)
    def daily(box: Annotated[Bbox, Depends(bbox_params)], ym: Annotated[str, Query(pattern=YM)]):
        """Per-day totals for one month. Days add up to the month's totals."""
        return store.daily(box, ym)

    @app.get("/api/points", response_model=HotspotSample, response_model_by_alias=True)
    def points(
        box: Annotated[Bbox, Depends(bbox_params)],
        ym: Annotated[str, Query(pattern=YM)],
        source: Source = "harmonized",
        day: Annotated[int | None, Query(ge=1, le=31)] = None,
        limit: Annotated[int, Query(ge=1)] = 4000,
    ):
        """Raw detections for the map: a deterministic sample of at most `limit` points, plus the true total."""
        sensors = ["modis", "viirs"] if source == "harmonized" else [source]
        try:
            rows, total = store.points(box, ym, sensors, day, min(limit, settings.max_points))
        except DataError as e:
            raise HTTPException(404, str(e))
        return {"points": rows, "total": total}

    @app.get("/api/hexes", response_model=HexSample, response_model_by_alias=True)
    def hexes(
        box: Annotated[Bbox, Depends(bbox_params)],
        start: Annotated[str, Query(alias="from", pattern=YM)],
        end: Annotated[str, Query(alias="to", pattern=YM)],
        source: Source = "harmonized",
        day: Annotated[int | None, Query(ge=1, le=31)] = None,
        limit: Annotated[int, Query(ge=1)] = 60000,
        res: Annotated[int, Query(ge=3, le=7)] = 7,
    ):
        """Fire map as H3 hexagons for a period: the days (summed over the months) with a detection, added up over the res7 cells
        (~5 km2) inside each hexagon of resolution `res` (3 coarsest .. 7 the data's own cells)."""
        if start > end:
            raise HTTPException(422, "from must not be after to.")
        if day is not None and start != end:
            raise HTTPException(422, "A single day needs from and to to be the same month.")
        sensors = ["modis", "viirs"] if source == "harmonized" else [source]
        return store.hexes(box, start, end, sensors, day, min(limit, settings.max_hexes), res)

    @app.get("/api/temps", response_model=TempSample, response_model_by_alias=True)
    def temps(
        box: Annotated[Bbox, Depends(bbox_params)],
        day: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
        month: Annotated[str | None, Query(pattern=YM)] = None,
        source: Source = "harmonized",
        limit: Annotated[int, Query(ge=1)] = 60000,
    ):
        """The hottest mid-infrared brightness temperature (bright_mir, Celsius) per res7 cell on one day (`day`, YYYY-MM-DD) or
        over one month (`month`, YYYY-MM): the map's temperature view. Needs RAW_DIR; 404 without it."""
        if (day is None) == (month is None):
            raise HTTPException(422, "Give either day or month.")
        if not store.has_cells:
            raise HTTPException(404, "Temperature data is not available for this dataset (no cells table and no RAW_DIR).")
        if day is not None:
            try:
                d = date.fromisoformat(day)
            except ValueError:
                raise HTTPException(422, "day is not a calendar date.")
            start = end = d.isoformat()
        else:
            y, m = int(month[:4]), int(month[5:])  # type: ignore[index]
            start, end = f"{y}-{m:02d}-01", f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"
        sensors = ["modis", "viirs"] if source == "harmonized" else [source]
        try:
            return store.temps(box, start, end, sensors, min(limit, settings.max_hexes))
        except DataError as e:
            raise HTTPException(404, str(e))

    @app.get("/api/analog", response_model=AnalogResult, response_model_by_alias=True)
    def analog_years(
        box: Annotated[Bbox, Depends(bbox_params)],
        year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
        cutoff: Annotated[int | None, Query(ge=1, le=12)] = None,
    ):
        """Past years whose fire season looked most like `year` so far (weeks up to the end of month `cutoff`).
        Without `year` it is the latest comparable year; without `cutoff` the latest month that year's data covers."""
        if store.analog_meta is None:
            raise HTTPException(404, "Analog data is not built for this dataset (see scripts/build_analog_weekly.py).")
        weeks = store.analog_weeks(box)
        years = analog.usable_target_years(weeks)
        if not years:
            raise HTTPException(404, "No fire records in this area to compare years.")
        target = year if year is not None else years[-1]
        if target not in years:
            raise HTTPException(404, f"No data to compare {target} with earlier years in this area.")
        month = cutoff if cutoff is not None else analog.default_cutoff_month(target, weeks[target])
        if month is None:
            raise HTTPException(422, f"{target} has less than a month of data in this area.")
        cutoff_week = analog.cutoff_week_for(target, month)
        if cutoff_week > analog.last_data_week(weeks[target]):
            raise HTTPException(422, f"{target} has no data up to that month yet.")
        ranking = analog.rank_similar_years(weeks, target, cutoff_week)
        if not ranking:
            raise HTTPException(404, "No earlier year has fire records in the compared weeks.")
        meta = store.analog_meta
        first_viirs = int(meta.get("viirsFromYear", 2012))
        top = ranking[:5]
        return {
            "targetYear": target,
            "cutoffMonth": month,
            "cutoffWeek": cutoff_week,
            "years": years,
            "ranking": [{**r, "era": "viirs" if r["year"] >= first_viirs else "modis"} for r in top],
            "targetFrp": analog.weekly_frp(weeks[target], cutoff_week),
            "fireSoFarPct": analog.fire_so_far_pct(weeks, target, cutoff_week),
            "series": [{"year": r["year"], "frp": analog.weekly_frp(weeks[r["year"]], 52)} for r in top[:3]],
            "source": meta.get("source", ""),
            "method": meta.get("method", ""),
            "isMock": bool(meta.get("isMock", False)),
        }

    @app.get("/api/export.csv")
    def export_csv(
        box: Annotated[Bbox, Depends(bbox_params)],
        start: Annotated[str, Query(pattern=YM)],
        end: Annotated[str, Query(pattern=YM)],
        level: Annotated[str, Query(pattern="^(monthly|daily|cells)$")] = "monthly",
        series: Source = "harmonized",
    ) -> Response:
        """CSV download with a provenance header (method, version, source, area, period)."""
        if start > end:
            raise HTTPException(422, "start must not be after end.")
        m = store.meta()
        head = [
            "# FireCalendar export",
            "# unit: active cell-days (a cell-day is one cell with at least one fire detection on one day)",
            f"# level: {level}",
            f"# source: {m.source}",
            f"# dataset_version: {m.version}{' (DEMO DATA - not real observations)' if m.is_mock else ''}",
            f"# harmonization_method: {m.method}",
            f"# displayed_series: {series}",
            f"# aoi_bbox (west,south,east,north): {box.west},{box.south},{box.east},{box.north}",
            f"# date_range: {start}..{end}",
            f"# generated: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        ]

        def num(v: float | None) -> str:
            return "" if v is None else str(round(v, 1))

        if level == "cells":
            if not store.has_cells:
                raise HTTPException(404, "Hotspot data is not available for this dataset (no cells table and no RAW_DIR).")
            sensors = ["modis", "viirs"] if series == "harmonized" else [series]
            try:
                found = store.export_cells(box, start, end, sensors, settings.max_export_rows)
            except DataError as e:
                raise HTTPException(404, str(e))
            if len(found) >= settings.max_export_rows:
                head.append(f"# truncated: only the first {settings.max_export_rows} rows (oldest first); ask for a shorter period")
            head.append("# columns: hottest_bright_mir_c is the hottest mid-infrared brightness temperature (Celsius), frp_mw the strongest fire radiative power (MW), observations the readings behind the cell-day")
            cols = "date,h3,lat,lon,hottest_bright_mir_c,frp_mw,observations"
            rows = [",".join([r["date"], r["h3"], str(r["lat"]), str(r["lon"]), num(r["temp_c"]), num(r["frp_mw"]), str(r["n"])]) for r in found]
        elif level == "monthly":
            cols = "year_month,modis_raw,viirs_raw,harmonized,method,scale_factor,in_calibration,data_status,cells"
            rows = [
                ",".join([
                    r["yearMonth"], num(r["modis"]), num(r["viirs"]), num(r["harmonized"]), "|".join(r["methods"]),
                    "" if r["scaleFactor"] is None else f"{r['scaleFactor']:.3f}",
                    str(r["allInCalibration"]).lower(), "nrt" if r["anyNrt"] else "standard", str(r["cells"]),
                ])
                for r in store.export_monthly(box, start, end, settings.max_export_rows)
            ]
        else:
            cols = "date,modis_raw,viirs_raw,harmonized"
            rows = [
                ",".join([r["date"], num(r["modis_raw"]), num(r["viirs_raw"]), num(r["harmonized"])])
                for r in store.export_daily(box, start, end, settings.max_export_rows)
            ]
        body = "\n".join([*head, cols, *rows]) + "\n"
        name = f"firecalendar_{level}_{series}_{start}_{end}.csv"
        return Response(body, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})

    @app.post("/api/explain", response_model=ExplainResponse, response_model_by_alias=True)
    def explain(req: ExplainRequest, request: Request):
        """Plain-language explanation of one month, built from computed facts (never from free text)."""
        limiter.check(request.client.host if request.client else "unknown")
        facts = build_facts(store.monthly(req.bbox), req)
        if facts is None:
            raise HTTPException(404, "No data for that month and area.")
        try:
            text = explainer.explain(facts, req.lang)
        except NotImplementedError as e:
            raise HTTPException(501, str(e)) from e
        return {"text": text, "provider": explainer.name, "facts": facts}

    return app
