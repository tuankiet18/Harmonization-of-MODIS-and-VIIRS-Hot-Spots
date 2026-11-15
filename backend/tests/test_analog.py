import shutil

import pytest

from app import analog
from conftest import BOX, make_client


# ---- the maths (formulas of the data team's notebook) -------------------------------------------------------------------
def _year(shape):
    """A year whose weekly FRP follows `shape` (list per week), with constant contrast and confidence."""
    return {w + 1: (f, f * 0.85 * 0.12, 4 * 0.12, 4 * 0.85, 4) for w, f in enumerate(shape) if f > 0}


def test_cutoff_week_counts_complete_weeks():
    assert analog.cutoff_week_for(2018, 6) == 181 // 7 == 25
    assert analog.cutoff_week_for(2020, 2) == (31 + 29) // 7  # leap year
    assert analog.cutoff_week_for(2018, 12) == 52  # capped, week 52 holds the last days


def test_cosine_and_dtw_basics():
    assert analog.cosine_sim([1, 2, 3], [1, 2, 3]) == pytest.approx(1.0)
    assert analog.cosine_sim([1, 0], [0, 1]) == 0.0
    assert analog.cosine_sim([0, 0], [1, 1]) == 0.0  # empty vector never divides by zero
    same = [[0.1, 0.1, 0.9]] * 5
    assert analog.dtw_sim_multifeature(same, same) == pytest.approx(1.0)
    assert analog.dtw_sim_multifeature([], []) == 0.0


def test_the_identical_season_ranks_first_and_scores_100():
    season = [1, 2, 4, 8, 16, 32, 16, 8, 4, 2, 1, 1] * 3
    weeks = {2018: _year(season), 2019: _year(season[::-1]), 2020: _year(season)}  # 2020 repeats 2018
    ranking = analog.rank_similar_years(weeks, 2020, 36)
    assert [r["year"] for r in ranking] == [2018, 2019]
    assert ranking[0]["scorePct"] == pytest.approx(100.0, abs=0.05)
    assert ranking[0]["marginPct"] == pytest.approx(100.0 - ranking[0]["scorePct"])
    assert ranking[1]["scorePct"] < ranking[0]["scorePct"]


def test_a_year_without_fire_in_the_window_is_left_out_and_later_years_are_never_candidates():
    season = [0, 0, 1, 3, 9, 3, 1, 0]
    weeks = {2018: {}, 2019: _year(season), 2020: _year(season), 2021: _year(season)}
    ranking = analog.rank_similar_years(weeks, 2020, 8)
    assert [r["year"] for r in ranking] == [2019]


def test_usable_target_years_need_an_earlier_year_and_enough_weeks():
    weeks = {2000: _year([1] * 10), 2001: _year([1] * 10), 2002: _year([1, 1])}
    assert analog.usable_target_years(weeks) == [2001]
    assert analog.default_cutoff_month(2001, weeks[2001]) == 2  # 10 weeks of data cover the 8 complete weeks to the end of February


def test_fire_so_far_is_a_share_of_the_typical_whole_year():
    full = _year([10] * 52)  # 520 for a whole year
    weeks = {2018: full, 2019: full, 2020: _year([10] * 13)}
    assert analog.fire_so_far_pct(weeks, 2020, 13) == 25.0  # 130 of 520
    assert analog.fire_so_far_pct({2020: _year([10] * 13)}, 2020, 13) == 0.0  # nothing earlier to compare with


def test_default_cutoff_is_the_latest_month_inside_the_data():
    by = _year([1] * 43)
    assert analog.default_cutoff_month(2026, by) == 10
    assert analog.default_cutoff_month(2026, _year([1] * 30)) == 7  # 212 // 7 = 30
    assert analog.default_cutoff_month(2026, _year([1] * 3)) is None


# ---- the endpoint -------------------------------------------------------------------------------------------------------
def test_analog_defaults_to_the_latest_year_and_month(client):
    r = client.get("/api/analog", params=BOX)
    assert r.status_code == 200
    j = r.json()
    assert j["targetYear"] == 2026 and j["cutoffMonth"] == 10 and j["cutoffWeek"] == 43
    assert j["years"][0] == 2001 and j["years"][-1] == 2026
    assert len(j["targetFrp"]) == 43 and all(len(s["frp"]) == 52 for s in j["series"])
    assert j["isMock"] is True and j["method"] and j["source"]
    assert j["fireSoFarPct"] > 50  # October is past the peak of this area's season
    scores = [c["scorePct"] for c in j["ranking"]]
    assert len(scores) == 5 and scores == sorted(scores, reverse=True) and all(0 <= s <= 100 for s in scores)
    assert all(c["year"] < 2026 for c in j["ranking"])
    assert [s["year"] for s in j["series"]] == [c["year"] for c in j["ranking"][:3]]
    assert {c["era"] for c in j["ranking"]} <= {"modis", "viirs"}
    assert all(c["era"] == ("viirs" if c["year"] >= 2012 else "modis") for c in j["ranking"])


def test_analog_for_a_chosen_year_and_month(client):
    j = client.get("/api/analog", params={**BOX, "year": 2018, "cutoff": 6}).json()
    assert j["targetYear"] == 2018 and j["cutoffMonth"] == 6 and j["cutoffWeek"] == 25
    assert len(j["targetFrp"]) == 25 and all(c["year"] < 2018 for c in j["ranking"])
    # this area's season peaks in September: almost nothing has burned by January, most of it by the end of October
    early = client.get("/api/analog", params={**BOX, "year": 2018, "cutoff": 1}).json()
    late = client.get("/api/analog", params={**BOX, "year": 2018, "cutoff": 10}).json()
    assert early["fireSoFarPct"] < 5 and late["fireSoFarPct"] > 50


def test_analog_errors(client, data_dir, tmp_path):
    assert client.get("/api/analog", params={**BOX, "year": 2000}).status_code == 404  # nothing earlier to compare with
    assert client.get("/api/analog", params={**BOX, "year": 2026, "cutoff": 12}).status_code == 422  # data ends in October
    assert client.get("/api/analog", params={**BOX, "cutoff": 13}).status_code == 422
    far = {"west": 0, "south": 50, "east": 5, "north": 55}
    assert client.get("/api/analog", params=far).status_code == 404
    # a dataset without the weekly table says so instead of failing
    for f in ("monthly.parquet", "daily.parquet", "points.parquet", "meta.json"):
        shutil.copy(data_dir / f, tmp_path / f)
    r = make_client(tmp_path).get("/api/analog", params=BOX)
    assert r.status_code == 404 and "build_analog_weekly" in r.json()["detail"]
