import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import Settings, get_settings
from .explain import build_facts, get_explainer
from .schemas import (
    Bbox,
    DataMeta,
    DayPoint,
    ExplainRequest,
    ExplainResponse,
    HexSample,
    HotspotSample,
    MonthlyPoint,
    Source,
)
from .store import Store

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
    store = Store(settings.data_dir, series_from_hex=settings.series_source == "hex")
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
        rows, total = store.points(box, ym, sensors, day, min(limit, settings.max_points))
        return {"points": rows, "total": total}

    @app.get("/api/hexes", response_model=HexSample, response_model_by_alias=True)
    def hexes(
        box: Annotated[Bbox, Depends(bbox_params)],
        start: Annotated[str, Query(alias="from", pattern=YM)],
        end: Annotated[str, Query(alias="to", pattern=YM)],
        source: Source = "harmonized",
        day: Annotated[int | None, Query(ge=1, le=31)] = None,
        limit: Annotated[int, Query(ge=1)] = 8000,
    ):
        """Fire map as H3 res7 hexagons for a period: the days (summed over the months) each ~5 km2 cell had a detection."""
        if start > end:
            raise HTTPException(422, "from must not be after to.")
        if day is not None and start != end:
            raise HTTPException(422, "A single day needs from and to to be the same month.")
        sensors = ["modis", "viirs"] if source == "harmonized" else [source]
        return store.hexes(box, start, end, sensors, day, min(limit, settings.max_hexes))

    @app.get("/api/export.csv")
    def export_csv(
        box: Annotated[Bbox, Depends(bbox_params)],
        start: Annotated[str, Query(pattern=YM)],
        end: Annotated[str, Query(pattern=YM)],
        level: Annotated[str, Query(pattern="^(monthly|daily)$")] = "monthly",
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

        if level == "monthly":
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
