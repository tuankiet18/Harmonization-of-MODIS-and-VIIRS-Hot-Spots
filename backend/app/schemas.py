"""Response shapes. Field names are camelCase on the wire so they match web/src/data/types.ts."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Source = Literal["harmonized", "modis", "viirs"]
Lang = Literal["en", "vi"]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Bbox(Camel):
    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)


class DataMeta(Camel):
    version: str
    method: str
    source: str
    grid_deg: float
    updated: str
    first_month: str
    last_month: str
    is_mock: bool


class MonthlyPoint(Camel):
    year_month: str
    year: int
    month: int
    modis: float | None
    viirs: float | None
    harmonized: float | None
    cells: int
    any_nrt: bool
    all_in_calibration: bool
    methods: list[str]
    scale_factor: float | None


class DayPoint(Camel):
    day: int
    modis: float | None
    viirs: float | None
    harmonized: float | None


class HotspotPoint(Camel):
    lat: float
    lon: float
    sensor: Literal["modis", "viirs"]


class HotspotSample(Camel):
    points: list[HotspotPoint]
    total: int


class HexCell(Camel):
    h3: str
    # Days of the month with at least one detection in this cell (1 when a single day is asked for).
    days: int


class HexSample(Camel):
    cells: list[HexCell]
    total: int  # res7 cells with fire in the area and period
    used: int  # res7 cells returned (less than total when the cap cut the quietest cells off)


class ExplainRequest(Camel):
    bbox: Bbox
    year_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    source: Source = "harmonized"
    lang: Lang = "en"
    place: str | None = Field(default=None, max_length=80)


class ExplainResponse(Camel):
    text: str
    provider: str
    # The numbers the text was built from, so the UI (and a reviewer) can check every claim.
    facts: dict[str, float | int | str | bool | None]
