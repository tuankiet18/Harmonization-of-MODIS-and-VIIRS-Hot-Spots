"""Monthly and daily series computed from the per-month hex files (instead of the synthetic parquet tables)."""
import shutil

import duckdb
import pytest
from conftest import BOX as SAMPLE_BOX, TINY, gen, make_client

import build_hex_months as bhm
from build_monthly_bins import build_monthly_bins

BOX = {"west": 19, "south": 9, "east": 21, "north": 11}
ONLY_A = {"west": 19.9, "south": 9.9, "east": 20.1, "north": 10.1}


def _row(date, sensor, cell, lat, lon):
    return f"(DATE '{date}', 'D', '{sensor}', '{cell}', {lat}, {lon}, 'Chad', 0, 330.0, 10.0, 1, 0, 'nominal')"


@pytest.fixture(scope="module")
def series_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("serdata")
    gen.build(d, regions=[TINY])
    A = ("87aaaaaaaffffff", 10.0, 20.0)
    B = ("87bbbbbbbffffff", 10.5, 20.5)
    rows = []

    def fire(sensor, ym, cell, days):
        rows.extend(_row(f"{ym}-{day:02d}", sensor, *cell) for day in days)

    fire("MODIS", "2001-05", A, [1, 2])                                    # Terra alone (Aqua flies from July 2002)
    fire("MODIS", "2002-06", A, [1])                                       # the last Terra-only month
    fire("MODIS", "2002-07", A, [1, 2])                                    # Terra and Aqua
    fire("MODIS", "2011-01", A, [1, 2])                                    # modis 2
    fire("MODIS", "2011-12", A, [1, 2]); fire("MODIS", "2011-12", B, [3])   # modis 3
    fire("MODIS", "2013-01", A, [1]); fire("MODIS", "2013-01", B, [1, 2])   # modis 3
    fire("VIIRS", "2013-01", A, [1, 2, 3, 4]); fire("VIIRS", "2013-01", B, [1, 2, 3])  # viirs 7
    fire("MODIS", "2013-02", A, [1]); fire("VIIRS", "2013-02", A, [1, 2])   # modis 1, viirs 2
    fire("MODIS", "2014-01", A, [1, 2])                                     # modis 2
    fire("VIIRS", "2014-01", A, [1, 2, 3]); fire("VIIRS", "2014-01", B, [1, 2])  # viirs 5
    src = d / "world.parquet"
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE t AS SELECT * FROM (VALUES " + ", ".join(rows) + ") AS v(acq_date, daynight, sensor_family, h3_res7, center_lat, center_lon, country, type, bright_mir, frp, point_count, conf_l, conf_tier)"
    )
    con.execute(f"COPY t TO '{src.as_posix()}' (FORMAT PARQUET)")
    bhm.build_hex_months(src.as_posix(), d / "hex")
    return d


@pytest.fixture(scope="module")
def series_client(series_dir):
    return make_client(series_dir, series_source="hex")


@pytest.fixture(scope="module")
def binned_client(series_dir, tmp_path_factory):
    """The same data, with the pre-added 0.25 degree table next to the hex files."""
    d = tmp_path_factory.mktemp("bindata")
    shutil.copytree(series_dir, d, dirs_exist_ok=True)
    assert build_monthly_bins(d / "hex") > 0
    return make_client(d, series_source="hex")


def _by_month(client, box=BOX):
    return {r["yearMonth"]: r for r in client.get("/api/monthly", params=box).json()}


def test_monthly_counts_cell_days_per_sensor_and_covers_only_months_with_data(series_client):
    m = _by_month(series_client)
    assert list(m) == ["2001-05", "2002-06", "2002-07", "2011-01", "2011-12", "2013-01", "2013-02", "2014-01"]
    assert (m["2013-01"]["modis"], m["2013-01"]["viirs"]) == (3, 7)
    assert m["2011-01"]["viirs"] is None


def test_from_2012_february_the_series_is_viirs_as_it_is(series_client):
    r = _by_month(series_client)["2013-01"]
    assert r["harmonized"] == 7 and r["methods"] == ["viirs_native"] and r["scaleFactor"] is None
    assert r["allInCalibration"] is True and r["cells"] == 2 and r["anyNrt"] is False


def test_before_2012_modis_is_scaled_by_the_monthly_factor_fitted_where_both_sensors_exist(series_client):
    m = _by_month(series_client)
    # January: VIIRS 7 + 5 over MODIS 3 + 2 in the overlap years = 2.4.
    assert m["2011-01"]["scaleFactor"] == 2.4 and m["2011-01"]["harmonized"] == pytest.approx(4.8)
    assert m["2011-01"]["methods"] == ["modis_scaled"] and m["2011-01"]["allInCalibration"] is False
    # December has no overlap month, so the factor over all overlap months is used: (7 + 2 + 5) / (3 + 1 + 2).
    assert m["2011-12"]["scaleFactor"] == pytest.approx(14 / 6, abs=1e-3) and m["2011-12"]["harmonized"] == pytest.approx(7.0, abs=0.05)


def test_the_box_picks_the_cells_by_their_centre(series_client):
    m = _by_month(series_client, ONLY_A)
    assert (m["2013-01"]["modis"], m["2013-01"]["viirs"]) == (1, 4)


def test_daily_counts_the_cells_with_fire_each_day_and_adds_up_to_the_month(series_client):
    days = {d["day"]: d for d in series_client.get("/api/daily", params={**BOX, "ym": "2013-01"}).json()}
    assert [days[i]["viirs"] for i in (1, 2, 3, 4)] == [2, 2, 2, 1]
    assert days[1]["modis"] == 2 and days[2]["modis"] == 1 and days[3]["modis"] == 0
    assert sum(d["viirs"] for d in days.values()) == 7 and sum(d["harmonized"] for d in days.values()) == 7
    assert len(days) == 31


def test_daily_before_2012_scales_modis_like_the_monthly_series(series_client):
    days = {d["day"]: d for d in series_client.get("/api/daily", params={**BOX, "ym": "2011-01"}).json()}
    assert days[1]["modis"] == 1 and days[1]["viirs"] is None and days[1]["harmonized"] == pytest.approx(2.4)
    assert series_client.get("/api/daily", params={**BOX, "ym": "2010-05"}).json() == []


def test_meta_describes_the_months_that_exist(series_client):
    m = series_client.get("/api/meta").json()
    assert (m["firstMonth"], m["lastMonth"], m["isMock"]) == ("2001-05", "2014-01", False)
    assert series_client.get("/health").json()["isMock"] is False


def test_the_csv_export_works_for_both_levels(series_client):
    monthly = series_client.get("/api/export.csv", params={**BOX, "start": "2013-01", "end": "2013-02"}).text.splitlines()
    assert [r.split(",")[0] for r in monthly if r[:1].isdigit()] == ["2013-01", "2013-02"]
    daily = series_client.get("/api/export.csv", params={**BOX, "start": "2013-01", "end": "2013-01", "level": "daily"}).text.splitlines()
    rows = [r for r in daily if r[:1].isdigit()]
    assert len(rows) == 31 and rows[0].startswith("2013-01-01")


def test_the_series_stay_on_the_sample_tables_unless_hex_is_asked_for(tmp_path_factory, series_client):
    # Same folder, default setting: hexagons come from the hex files, but the monthly series is still the synthetic table.
    folder = next(p for p in tmp_path_factory.getbasetemp().glob("serdata*") if (p / "hex").exists())
    plain = make_client(folder)
    assert plain.get("/api/meta").json()["isMock"] is True
    assert len(plain.get("/api/monthly", params=SAMPLE_BOX).json()) == 312


def test_asking_for_hex_series_without_hex_files_is_refused_at_start(tmp_path):
    from app.store import DataError

    gen.build(tmp_path, regions=[TINY])
    with pytest.raises(DataError):
        make_client(tmp_path, series_source="hex")


def test_the_months_with_only_the_terra_satellite_have_no_combined_value(series_client):
    m = _by_month(series_client)
    for ym in ("2001-05", "2002-06"):
        # The raw MODIS count stays; the combined series is left empty rather than reading as "little fire".
        assert m[ym]["modis"] is not None and m[ym]["harmonized"] is None and m[ym]["scaleFactor"] is None
    # From July 2002 Aqua is flying too, so the month is scaled like any other (no January overlap: the all-month factor 14/6).
    assert m["2002-07"]["harmonized"] == pytest.approx(2 * 14 / 6, abs=0.05)


def test_the_daily_series_of_a_terra_only_month_has_no_combined_value_either(series_client):
    days = series_client.get("/api/daily", params={**BOX, "ym": "2001-05"}).json()
    assert days[0]["modis"] == 1 and all(d["harmonized"] is None for d in days)
    later = series_client.get("/api/daily", params={**BOX, "ym": "2002-07"}).json()
    assert later[0]["harmonized"] == pytest.approx(14 / 6, abs=0.05)


def test_a_big_area_reads_the_pre_added_table_and_gives_the_same_numbers(series_client, binned_client):
    exact, binned = _by_month(series_client), _by_month(binned_client)
    assert list(binned) == list(exact)
    for ym, row in exact.items():
        for key in ("modis", "viirs", "harmonized", "cells", "scaleFactor"):
            assert binned[ym][key] == row[key], (ym, key)


def test_a_small_area_stays_exact_even_with_the_table(binned_client):
    m = _by_month(binned_client, ONLY_A)
    assert (m["2013-01"]["modis"], m["2013-01"]["viirs"]) == (1, 4)


def test_the_real_data_needs_no_sample_tables_and_has_no_raw_points(series_dir, tmp_path):
    """A data folder with only the hex files is enough: no synthetic tables, no demo meta, and /api/points answers 404."""
    shutil.copytree(series_dir / "hex", tmp_path / "hex")
    c = make_client(tmp_path, series_source="hex")
    meta = c.get("/api/meta").json()
    assert meta["isMock"] is False and meta["firstMonth"] == "2001-05"
    assert c.get("/api/monthly", params=BOX).status_code == 200
    assert c.get("/api/hexes", params={**BOX, "from": "2013-01", "to": "2013-01"}).status_code == 200
    assert c.get("/api/points", params={**BOX, "ym": "2013-01"}).status_code == 404


def test_a_map_of_whole_years_reads_the_yearly_table_and_gives_the_same_cells(series_dir, series_client, tmp_path):
    from build_cell_years import build_cell_years

    shutil.copytree(series_dir, tmp_path / "d", dirs_exist_ok=True)
    assert build_cell_years(tmp_path / "d" / "hex") > 0
    fast = make_client(tmp_path / "d", series_source="hex")
    # 2011-06..2011-12 are single months, 2013 and 2014 are whole years: both paths are used and added up
    params = {**BOX, "from": "2011-06", "to": "2014-12", "res": 7}
    slow_cells = {c["h3"]: c["days"] for c in series_client.get("/api/hexes", params=params).json()["cells"]}
    fast_json = fast.get("/api/hexes", params=params).json()
    assert {c["h3"]: c["days"] for c in fast_json["cells"]} == slow_cells and slow_cells
    # a coarser hexagon adds the same days up
    coarse = {**params, "res": 4}
    assert fast.get("/api/hexes", params=coarse).json()["cells"] == series_client.get("/api/hexes", params=coarse).json()["cells"]
