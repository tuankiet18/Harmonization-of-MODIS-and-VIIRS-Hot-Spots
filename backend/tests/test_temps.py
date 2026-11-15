"""/api/temps: the hottest mid-infrared brightness temperature per cell on one day or in one month, from the per-year files."""
import shutil

import duckdb
import pytest
from build_cells import build_cells
from conftest import make_client

BOX = {"west": 19, "south": 9, "east": 21, "north": 11}
A, B, C = ("87aaaaaaaffffff", 10.0, 20.0), ("87bbbbbbbffffff", 10.5, 20.5), ("87cccccccffffff", 10.2, 20.2)


def _row(day, cell, kelvin, origin="OBSERVED_VIIRS", platform="S-NPP", type_=0, points=2, low=0):
    return f"(DATE '{day}', '{cell[0]}', {cell[1]}, {cell[2]}, {kelvin}, 12.5, {points}, {low}, {type_}, '{origin}', '{platform}')"


@pytest.fixture(scope="module")
def raw_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("raw")
    rows = [
        _row("2023-03-05", A, 323.15), _row("2023-03-05", A, 343.15),                       # two readings of one cell: the hotter, 70 C
        _row("2023-03-05", B, 333.15, origin="MODIS_ESTIMATED_VIIRS_LIKE", platform="Aqua"),  # 60 C, MODIS estimated
        _row("2023-03-05", C, 363.15, platform="NOAA-20"),                                    # left out: NOAA-20
        _row("2023-03-05", C, 373.15, type_=2),                                               # left out: static source
        _row("2023-03-05", C, 353.15, points=2, low=2),                                       # left out: only low-confidence points
        _row("2023-03-06", A, 313.15),                                                        # 40 C the next day
        _row("2023-03-20", B, 338.15),                                                        # 65 C later in the month
    ]
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE t AS SELECT * FROM (VALUES " + ", ".join(rows) + ") AS v(acq_date, h3_res7, center_lat, center_lon, bright_mir, frp, point_count, conf_l, type, record_origin, source_platform)"
    )
    con.execute(f"COPY t TO '{(d / '2023.parquet').as_posix()}' (FORMAT PARQUET)")
    return d


@pytest.fixture(scope="module")
def client(data_dir, raw_dir):
    return make_client(data_dir, raw_dir=raw_dir)


def _temps(client, **params):
    r = client.get("/api/temps", params={**BOX, **params})
    assert r.status_code == 200, r.text
    return {c["h3"]: c for c in r.json()["cells"]}, r.json()


def test_a_day_gives_the_hottest_reading_of_each_cell_in_celsius(client):
    cells, body = _temps(client, day="2023-03-05")
    assert {k: v["tempC"] for k, v in cells.items()} == {A[0]: 70.0, B[0]: 60.0}
    assert cells[A[0]]["n"] == 2
    assert body["total"] == 2 and body["used"] == 2 and body["metric"] == "bright_mir"


def test_noaa20_static_sources_and_low_confidence_points_are_left_out(client):
    cells, _ = _temps(client, day="2023-03-05")
    assert C[0] not in cells


def test_a_month_takes_the_hottest_reading_over_all_its_days(client):
    cells, _ = _temps(client, month="2023-03")
    assert cells[A[0]]["tempC"] == 70.0 and cells[B[0]]["tempC"] == 65.0


def test_source_picks_the_satellites(client):
    only_viirs, _ = _temps(client, day="2023-03-05", source="viirs")
    only_modis, _ = _temps(client, day="2023-03-05", source="modis")
    assert set(only_viirs) == {A[0]} and set(only_modis) == {B[0]}


def test_only_cells_inside_the_box_come_back(client):
    cells, _ = _temps(client, day="2023-03-05", west=19.9, south=9.9, east=20.1, north=10.1)
    assert set(cells) == {A[0]}


def test_a_day_without_data_or_a_year_without_a_file_is_just_empty(client):
    assert _temps(client, day="2023-04-01")[0] == {}
    assert _temps(client, day="2010-01-01")[0] == {}


def test_bad_requests(client, data_dir):
    assert client.get("/api/temps", params=BOX).status_code == 422
    assert client.get("/api/temps", params={**BOX, "day": "2023-03-05", "month": "2023-03"}).status_code == 422
    assert client.get("/api/temps", params={**BOX, "day": "2023-02-31"}).status_code == 422
    assert make_client(data_dir).get("/api/temps", params={**BOX, "day": "2023-03-05"}).status_code == 404


def _csv_rows(client, **params):
    r = client.get("/api/export.csv", params={**BOX, "level": "cells", "start": "2023-03", "end": "2023-03", **params})
    assert r.status_code == 200, r.text
    lines = r.text.splitlines()
    i = lines.index("date,h3,lat,lon,hottest_bright_mir_c,frp_mw,observations")
    return lines[:i], [row.split(",") for row in lines[i + 1 :]]


def test_the_cells_csv_lists_every_cell_day_with_its_hottest_reading(client):
    head, rows = _csv_rows(client)
    assert [(r[0], r[1], r[4]) for r in rows] == [
        ("2023-03-05", A[0], "70.0"), ("2023-03-05", B[0], "60.0"), ("2023-03-06", A[0], "40.0"), ("2023-03-20", B[0], "65.0"),
    ]
    assert any(line.startswith("# date_range: 2023-03..2023-03") for line in head)


def test_the_cells_csv_stops_at_the_row_cap_and_says_so(data_dir, raw_dir):
    capped = make_client(data_dir, raw_dir=raw_dir, max_export_rows=2)
    head, rows = _csv_rows(capped)
    assert len(rows) == 2 and any(line.startswith("# truncated") for line in head)


def test_the_cells_csv_needs_the_raw_files(data_dir):
    r = make_client(data_dir).get("/api/export.csv", params={**BOX, "level": "cells", "start": "2023-03", "end": "2023-03"})
    assert r.status_code == 404


@pytest.fixture(scope="module")
def cells_client(data_dir, raw_dir, tmp_path_factory):
    """The same data read from the slim cell-day table (scripts/build_cells.py) instead of the per-year file."""
    d = tmp_path_factory.mktemp("cellsdata")
    shutil.copytree(data_dir, d, dirs_exist_ok=True)
    build_cells((raw_dir / "2023.parquet").as_posix(), d / "cells")
    return make_client(d)  # no RAW_DIR: the slim table alone must be enough


@pytest.mark.parametrize("params", [{"day": "2023-03-05"}, {"month": "2023-03"}, {"day": "2023-03-05", "source": "viirs"}, {"day": "2023-03-05", "source": "modis"}])
def test_the_slim_table_gives_the_same_temperatures_as_the_per_year_file(client, cells_client, params):
    assert _temps(cells_client, **params)[1] == _temps(client, **params)[1]


def test_the_slim_table_gives_the_same_cells_csv(client, cells_client):
    assert _csv_rows(cells_client)[1] == _csv_rows(client)[1]
