"""The monthly and daily series of a country follow its borders (the `country` column of the hex files), not the box around it."""
import duckdb
import pytest
from conftest import BOX as SAMPLE_BOX, TINY, gen, make_client

import build_hex_months as bhm
from build_monthly_bins import build_monthly_bins

BOX = {"west": 19, "south": 9, "east": 21, "north": 11}
A, B, C = ("87aaaaaaaffffff", 10.0, 20.0), ("87bbbbbbbffffff", 10.5, 20.5), ("87cccccccffffff", 10.2, 20.2)


def _row(date, sensor, cell, country):
    return f"(DATE '{date}', 'D', '{sensor}', '{cell[0]}', {cell[1]}, {cell[2]}, '{country}', 0, 330.0, 10.0, 1, 0, 'nominal')"


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    d = tmp_path_factory.mktemp("countries")
    gen.build(d, regions=[TINY])
    rows = [_row(f"2013-01-{day:02d}", "VIIRS", A, "Chad") for day in (1, 2, 3)]
    rows += [_row(f"2013-01-{day:02d}", "VIIRS", B, "Niger") for day in (1, 2)]
    rows += [_row("2013-01-01", "VIIRS", C, "Chad"), _row("2013-01-02", "VIIRS", C, "Niger")]  # a cell on the border: one day each side
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE t AS SELECT * FROM (VALUES " + ", ".join(rows) + ") AS v(acq_date, daynight, sensor_family, h3_res7, center_lat, center_lon, country, type, bright_mir, frp, point_count, conf_l, conf_tier)"
    )
    src = d / "world.parquet"
    con.execute(f"COPY t TO '{src.as_posix()}' (FORMAT PARQUET)")
    bhm.build_hex_months(src.as_posix(), d / "hex")
    build_monthly_bins(d / "hex")
    return make_client(d, series_source="hex")


def _viirs(client, **extra):
    rows = client.get("/api/monthly", params={**BOX, **extra}).json()
    return {r["yearMonth"]: r for r in rows}["2013-01"]


def test_without_a_country_the_box_counts_every_cell_day_once(client):
    assert _viirs(client)["viirs"] == 7  # A 3 + B 2 + the border cell on two different days


def test_a_country_counts_only_its_own_cell_days(client):
    chad, niger = _viirs(client, country="Chad"), _viirs(client, country="Niger")
    assert (chad["viirs"], chad["cells"]) == (4, 2)  # A on 3 days, C on 1
    assert (niger["viirs"], niger["cells"]) == (3, 2)  # B on 2 days, C on 1
    assert chad["viirs"] + niger["viirs"] == 7


def test_a_country_that_is_not_in_the_data_has_no_months(client):
    assert client.get("/api/monthly", params={**BOX, "country": "Atlantis"}).json() == []


def test_daily_follows_the_country_too(client):
    days = {d["day"]: d["viirs"] for d in client.get("/api/daily", params={**BOX, "ym": "2013-01", "country": "Chad"}).json()}
    assert days[1] == 2 and days[2] == 1 and days[3] == 1  # A and C on day 1, A on day 2, A on day 3
    niger = {d["day"]: d["viirs"] for d in client.get("/api/daily", params={**BOX, "ym": "2013-01", "country": "Niger"}).json()}
    assert niger[1] == 1 and niger[2] == 2


def test_the_monthly_csv_says_which_country_it_is(client):
    r = client.get("/api/export.csv", params={**BOX, "start": "2013-01", "end": "2013-01", "country": "Chad"})
    assert "# aoi_country: Chad" in r.text
    assert "2013-01,,4.0" in r.text
