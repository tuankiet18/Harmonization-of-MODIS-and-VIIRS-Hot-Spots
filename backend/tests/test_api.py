import pytest

from conftest import BOX, make_client


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "isMock": True}


def test_meta_uses_camel_case(client):
    m = client.get("/api/meta").json()
    assert m["firstMonth"] == "2000-11" and m["lastMonth"] == "2026-10" and m["isMock"] is True


def test_monthly_shape_and_history(client):
    rows = client.get("/api/monthly", params=BOX).json()
    assert len(rows) == 312 and rows[0]["yearMonth"] == "2000-11" and rows[-1]["yearMonth"] == "2026-10"
    first, mid, last = rows[0], next(r for r in rows if r["yearMonth"] == "2018-09"), rows[-1]
    assert first["viirs"] is None and first["methods"] == ["modis_scaled"] and first["cells"] == 16 and first["scaleFactor"] > 0
    assert mid["methods"] == ["viirs_native"] and mid["allInCalibration"] is True and mid["scaleFactor"] is None
    assert mid["harmonized"] == mid["viirs"]
    assert last["anyNrt"] is True
    assert set(first) >= {"yearMonth", "year", "month", "modis", "viirs", "harmonized", "cells", "anyNrt", "allInCalibration", "methods", "scaleFactor"}


def test_series_switches_from_modis_to_viirs_at_2013(client):
    rows = {r["yearMonth"]: r for r in client.get("/api/monthly", params=BOX).json()}
    assert rows["2012-12"]["methods"] == ["modis_scaled"] and rows["2013-01"]["methods"] == ["viirs_native"]
    assert rows["2022-12"]["allInCalibration"] is True and rows["2023-01"]["allInCalibration"] is False


def test_monthly_viirs_counts_exceed_modis(client):
    row = next(r for r in client.get("/api/monthly", params=BOX).json() if r["yearMonth"] == "2019-09")
    assert 2.5 < row["viirs"] / row["modis"] < 5


def test_monthly_outside_data_is_empty(client):
    assert client.get("/api/monthly", params={"west": 0, "south": 50, "east": 5, "north": 55}).json() == []


@pytest.mark.parametrize("bad", [
    {"west": -56, "south": -10, "east": -60, "north": -6},   # west > east
    {"west": -60, "south": -6, "east": -56, "north": -10},   # south > north
    {"west": -200, "south": -10, "east": -56, "north": -6},  # out of range
])
def test_bbox_validation(client, bad):
    assert client.get("/api/monthly", params=bad).status_code == 422


def test_daily_adds_up_to_month(client):
    month = next(r for r in client.get("/api/monthly", params=BOX).json() if r["yearMonth"] == "2025-03")
    days = client.get("/api/daily", params={**BOX, "ym": "2025-03"}).json()
    assert [d["day"] for d in days] == list(range(1, 32))
    assert sum(d["modis"] for d in days) == month["modis"]
    assert sum(d["viirs"] for d in days) == month["viirs"]
    assert sum(d["harmonized"] for d in days) == pytest.approx(month["harmonized"], abs=1.0)


def test_daily_missing_month_is_empty(client):
    assert client.get("/api/daily", params={**BOX, "ym": "2010-05"}).json() == []


def test_daily_rejects_bad_month(client):
    assert client.get("/api/daily", params={**BOX, "ym": "2025-13"}).status_code == 422


def test_points_month_and_day(client):
    month = client.get("/api/points", params={**BOX, "ym": "2026-09"}).json()
    assert month["total"] > 0 and len(month["points"]) == month["total"]
    p = month["points"][0]
    assert -10 <= p["lat"] <= -6 and -60 <= p["lon"] <= -56 and p["sensor"] in ("modis", "viirs")
    one = client.get("/api/points", params={**BOX, "ym": "2026-09", "day": 12}).json()
    assert one["total"] < month["total"]


def test_points_source_filter_and_limit(client):
    only = client.get("/api/points", params={**BOX, "ym": "2026-09", "source": "modis"}).json()
    assert only["points"] and {p["sensor"] for p in only["points"]} == {"modis"}
    capped = client.get("/api/points", params={**BOX, "ym": "2026-09", "limit": 10}).json()
    assert len(capped["points"]) == 10 and capped["total"] > 10


def test_points_sample_is_stable(client):
    a = client.get("/api/points", params={**BOX, "ym": "2026-09", "limit": 25}).json()
    b = client.get("/api/points", params={**BOX, "ym": "2026-09", "limit": 25}).json()
    assert a == b


def test_points_limit_is_capped_by_server(data_dir):
    c = make_client(data_dir, max_points=5)
    assert len(c.get("/api/points", params={**BOX, "ym": "2026-09", "limit": 4000}).json()["points"]) == 5


def test_export_monthly_csv(client):
    r = client.get("/api/export.csv", params={**BOX, "start": "2019-01", "end": "2019-03"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    lines = r.text.strip().splitlines()
    assert any(l.startswith("# dataset_version: sample-0.1 (DEMO DATA") for l in lines)
    i = lines.index("year_month,modis_raw,viirs_raw,harmonized,method,scale_factor,in_calibration,data_status,cells")
    assert [l.split(",")[0] for l in lines[i + 1:]] == ["2019-01", "2019-02", "2019-03"]


def test_export_daily_csv(client):
    r = client.get("/api/export.csv", params={**BOX, "start": "2025-03", "end": "2025-03", "level": "daily"})
    lines = r.text.strip().splitlines()
    i = lines.index("date,modis_raw,viirs_raw,harmonized")
    assert len(lines) - i - 1 == 31 and lines[i + 1].startswith("2025-03-01,")


def test_export_rejects_reversed_range(client):
    assert client.get("/api/export.csv", params={**BOX, "start": "2020-05", "end": "2020-01"}).status_code == 422


def test_cors_allows_only_configured_origin(client):
    ok = client.get("/health", headers={"Origin": "http://localhost:5173"})
    bad = client.get("/health", headers={"Origin": "https://evil.example"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in bad.headers


def test_hexes_group_detections_into_h3_cells(client):
    import h3

    j = client.get("/api/hexes", params={**BOX, "from": "2026-09", "to": "2026-09"}).json()
    assert j["total"] > 0 and j["cells"]
    assert {"h3", "days"} <= set(j["cells"][0])
    for c in j["cells"]:
        assert h3.get_resolution(c["h3"]) == 7 and 1 <= c["days"] <= 30
    # Uncapped, every cell with fire is returned: total counts cells (not detections), used is how many came back.
    assert j["total"] == j["used"] == len(j["cells"])


def test_hexes_for_one_day_are_single_day_cells(client):
    cells = client.get("/api/hexes", params={**BOX, "from": "2026-09", "to": "2026-09", "day": 5}).json()["cells"]
    assert cells and all(c["days"] == 1 for c in cells)


def test_hexes_respect_series_and_empty_months(client):
    both = client.get("/api/hexes", params={**BOX, "from": "2026-09", "to": "2026-09"}).json()
    modis = client.get("/api/hexes", params={**BOX, "from": "2026-09", "to": "2026-09", "source": "modis"}).json()
    assert 0 < modis["total"] <= both["total"]
    assert client.get("/api/hexes", params={**BOX, "from": "2010-01", "to": "2010-01"}).json() == {"cells": [], "total": 0, "used": 0}


def test_hexes_over_a_period_add_up_the_days_of_every_month(client):
    one = {c["h3"]: c["days"] for c in client.get("/api/hexes", params={**BOX, "from": "2026-09", "to": "2026-09"}).json()["cells"]}
    both = {c["h3"]: c["days"] for c in client.get("/api/hexes", params={**BOX, "from": "2026-08", "to": "2026-09"}).json()["cells"]}
    aug = {c["h3"]: c["days"] for c in client.get("/api/hexes", params={**BOX, "from": "2026-08", "to": "2026-08"}).json()["cells"]}
    for h3 in set(one) | set(aug):
        assert both[h3] == one.get(h3, 0) + aug.get(h3, 0)


def test_hexes_reject_a_backwards_period_and_a_day_over_several_months(client):
    assert client.get("/api/hexes", params={**BOX, "from": "2026-09", "to": "2026-08"}).status_code == 422
    assert client.get("/api/hexes", params={**BOX, "from": "2026-08", "to": "2026-09", "day": 5}).status_code == 422
    assert client.get("/api/hexes", params={**BOX, "ym": "2026-09"}).status_code == 422  # the old single-month form is gone


def test_empty_answers_get_a_short_cache_and_full_ones_do_not(client):
    """An empty answer may only mean the data was not loaded yet, so nginx keeps it a minute (X-Accel-Expires), not days."""
    away = {"west": 0, "south": 50, "east": 5, "north": 55}
    assert client.get("/api/monthly", params=away).headers.get("X-Accel-Expires") == "60"
    assert client.get("/api/hexes", params={**away, "from": "2018-01", "to": "2018-03"}).headers.get("X-Accel-Expires") == "60"
    assert "X-Accel-Expires" not in client.get("/api/monthly", params=BOX).headers
    assert "X-Accel-Expires" not in client.get("/api/hexes", params={**BOX, "from": "2026-09", "to": "2026-09"}).headers
