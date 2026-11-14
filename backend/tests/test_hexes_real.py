"""/api/hexes reading the per-month hex files built from the data team's parquet (instead of the synthetic points table)."""
import duckdb
import pytest
from conftest import TINY, gen, make_client

import build_hex_months as bhm

BOX = {"west": 19, "south": 9, "east": 21, "north": 11}


@pytest.fixture(scope="module")
def hex_client(tmp_path_factory):
    d = tmp_path_factory.mktemp("hexdata")
    gen.build(d, regions=[TINY])
    src = d / "world.parquet"
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t AS SELECT * FROM (VALUES
          (DATE '2001-03-01', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 2, 'nominal'),
          (DATE '2001-03-01', 'N', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 1, 'nominal'),
          (DATE '2001-03-05', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 3, 'nominal'),
          (DATE '2001-03-05', 'D', 'MODIS', '87bbbbbbbffffff', 10.5, 20.5, 'Chad', 4, 'nominal'),
          (DATE '2001-03-05', 'D', 'MODIS', '87ddddddaffffff', 30.0, 40.0, 'Egypt', 9, 'nominal'),
          (DATE '2001-03-02', 'D', 'VIIRS', '87eeeeeeaffffff', 10.2, 20.2, 'Chad', 6, 'nominal'),
          (DATE '2015-03-02', 'D', 'VIIRS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 7, 'nominal'),
          (DATE '2015-03-03', 'D', 'MODIS', '87bbbbbbbffffff', 10.5, 20.5, 'Chad', 2, 'nominal')
        ) AS v(acq_date, daynight, sensor_family, h3_res7, center_lat, center_lon, country, point_count, conf_tier)"""
    )
    con.execute(f"COPY t TO '{src.as_posix()}' (FORMAT PARQUET)")
    bhm.build_hex_months(src.as_posix(), d / "hex")
    return make_client(d)


def test_cells_come_from_the_hex_files_with_days_counted(hex_client):
    j = hex_client.get("/api/hexes", params={**BOX, "ym": "2001-03"}).json()
    cells = {c["h3"]: c["days"] for c in j["cells"]}
    # Before 2013 the harmonized series is MODIS only, so the VIIRS cell is not drawn and Egypt is outside the box.
    assert cells == {"87aaaaaaaffffff": 2, "87bbbbbbbffffff": 1}
    assert j["total"] == j["used"] == 2  # cells, not detections


def test_from_2013_the_harmonized_series_is_viirs(hex_client):
    j = hex_client.get("/api/hexes", params={**BOX, "ym": "2015-03"}).json()
    assert {c["h3"] for c in j["cells"]} == {"87aaaaaaaffffff"} and j["total"] == 1


def test_a_series_can_be_picked_explicitly(hex_client):
    j = hex_client.get("/api/hexes", params={**BOX, "ym": "2001-03", "source": "viirs"}).json()
    assert [c["h3"] for c in j["cells"]] == ["87eeeeeeaffffff"]


def test_one_day_gives_single_day_cells(hex_client):
    j = hex_client.get("/api/hexes", params={**BOX, "ym": "2001-03", "day": 5}).json()
    assert {c["h3"]: c["days"] for c in j["cells"]} == {"87aaaaaaaffffff": 1, "87bbbbbbbffffff": 1}
    assert j["total"] == j["used"] == 2
    assert hex_client.get("/api/hexes", params={**BOX, "ym": "2001-03", "day": 2}).json()["cells"] == []


def test_box_filters_on_cell_centres_and_missing_months_are_empty(hex_client):
    far = {"west": 39, "south": 29, "east": 41, "north": 31}
    assert [c["h3"] for c in hex_client.get("/api/hexes", params={**far, "ym": "2001-03"}).json()["cells"]] == ["87ddddddaffffff"]
    assert hex_client.get("/api/hexes", params={**BOX, "ym": "2010-06"}).json() == {"cells": [], "total": 0, "used": 0}


def test_the_cap_cuts_the_quietest_cells_and_says_so(hex_client):
    j = hex_client.get("/api/hexes", params={**BOX, "ym": "2001-03", "limit": 1}).json()
    assert [c["h3"] for c in j["cells"]] == ["87aaaaaaaffffff"]  # the cell with the most days
    assert j["total"] == 2 and j["used"] == 1
