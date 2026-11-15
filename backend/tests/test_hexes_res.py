"""/api/hexes at a coarser resolution: the server adds the res7 cells up into bigger hexagons, so nothing is cut off."""
import duckdb
import h3
import pytest
from conftest import BOX as SAMPLE_BOX, TINY, gen, make_client

import build_hex_months as bhm

BOX = {"west": 19, "south": 9, "east": 22, "north": 12}
# Two neighbouring res7 cells (same res4 and res5 parent), one cell a few degrees away.
A = h3.latlng_to_cell(10.00, 20.00, 7)
B = next(n for n in h3.grid_disk(A, 1) if n != A)
C = h3.latlng_to_cell(11.50, 21.50, 7)


def _lat_lon(cell):
    return h3.cell_to_latlng(cell)


@pytest.fixture(scope="module")
def res_client(tmp_path_factory):
    d = tmp_path_factory.mktemp("resdata")
    gen.build(d, regions=[TINY])
    rows = []
    for cell, days in ((A, [1, 2, 3]), (B, [2, 3]), (C, [5])):
        lat, lon = _lat_lon(cell)
        rows += [f"(DATE '2001-03-{day:02d}', 'D', 'MODIS', '{cell}', {lat}, {lon}, 'Chad', 0, 330.0, 10.0, 1, 0, 'nominal')" for day in days]
    src = d / "world.parquet"
    con = duckdb.connect()
    con.execute("CREATE TABLE t AS SELECT * FROM (VALUES " + ", ".join(rows) + ") AS v(acq_date, daynight, sensor_family, h3_res7, center_lat, center_lon, country, type, bright_mir, frp, point_count, conf_l, conf_tier)")
    con.execute(f"COPY t TO '{src.as_posix()}' (FORMAT PARQUET)")
    bhm.build_hex_months(src.as_posix(), d / "hex")
    return make_client(d)


def _get(client, box=BOX, **params):
    return client.get("/api/hexes", params={**box, "from": "2001-03", "to": "2001-03", **params}).json()


def test_res7_is_the_default_and_unchanged(res_client):
    j = _get(res_client)
    assert {c["h3"]: c["days"] for c in j["cells"]} == {A: 3, B: 2, C: 1}
    assert _get(res_client, res=7) == j


def test_a_coarser_resolution_adds_the_cell_days_of_the_cells_inside(res_client):
    j = _get(res_client, res=4)
    got = {c["h3"]: c["days"] for c in j["cells"]}
    expect = {}
    for cell, days in ((A, 3), (B, 2), (C, 1)):
        expect[h3.cell_to_parent(cell, 4)] = expect.get(h3.cell_to_parent(cell, 4), 0) + days
    assert got == expect
    assert all(h3.get_resolution(h) == 4 for h in got)
    assert j["total"] == j["used"] == len(expect)


@pytest.mark.parametrize("res", [3, 4, 5, 6])
def test_no_cell_day_is_lost_at_any_resolution(res_client, res):
    assert sum(c["days"] for c in _get(res_client, res=res)["cells"]) == 3 + 2 + 1


def test_one_day_at_a_coarse_resolution_counts_the_cells_with_fire_that_day(res_client):
    j = _get(res_client, res=4, day=3, **{})
    assert sum(c["days"] for c in j["cells"]) == 2  # cells A and B burn on day 3, C does not


def test_the_cap_applies_to_the_hexagons_returned_not_to_the_cells_inside(res_client):
    j = _get(res_client, res=4, limit=1)
    assert len(j["cells"]) == 1 and j["total"] >= 1 and j["cells"][0]["days"] == max(c["days"] for c in _get(res_client, res=4)["cells"])


@pytest.mark.parametrize("res", [2, 8])
def test_a_resolution_outside_3_to_7_is_refused(res_client, res):
    assert res_client.get("/api/hexes", params={**BOX, "from": "2001-03", "to": "2001-03", "res": res}).status_code == 422


def test_the_sample_table_supports_res_too(client):
    p = {**SAMPLE_BOX, "from": "2026-09", "to": "2026-09"}
    fine = client.get("/api/hexes", params=p).json()
    coarse = client.get("/api/hexes", params={**p, "res": 4}).json()
    assert sum(c["days"] for c in coarse["cells"]) == sum(c["days"] for c in fine["cells"])
    assert 0 < len(coarse["cells"]) <= len(fine["cells"])
    assert all(h3.get_resolution(c["h3"]) == 4 for c in coarse["cells"])
