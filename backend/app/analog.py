"""Historical analog years: which past years had a fire season most like this year's so far.

The formulas are the data team's, ported from colab_burning_calendar_analog.ipynb:

* Each year is a weekly series (weeks 1..cutoff_week) of three signals, built from one record per (H3 cell, day):
  the fire radiative power (FRP), the thermal contrast (bright_mir - bright_tir) / bright_tir, and a confidence weight
  (1.0 * conf_h + 0.6 * conf_n + 0.2 * conf_l) / point_count.
* score = 50 % cosine similarity of the weekly "fire score" shares + 50 % banded DTW over (FRP share, contrast share, confidence).
* margin = 100 - score. It only says how loosely a year matches. It is NOT a statistical confidence interval.

Differences from the notebook, on purpose:

* The weekly sums are precomputed per 1 degree bin (scripts/build_analog_weekly.py), so an area is the sum of the bins whose centre
  lies inside it, and the cutoff is a whole number of complete weeks (days beyond the cutoff are never read).
* A past year with no fire signal at all inside the compared weeks is left out instead of scoring zero.

Pure Python on purpose: the series are 52 weeks long, so numpy would only add weight to the image.
"""
import math
from dataclasses import dataclass

DTW_WEIGHTS = (0.5, 0.3, 0.2)
DTW_WINDOW = 2
EPS = 1e-9

# year -> week (1..52) -> (sum_frp, sum_score, sum_temp, sum_conf, n_cell_days)
WeekSums = tuple[float, float, float, float, int]
Weeks = dict[int, dict[int, WeekSums]]


@dataclass(frozen=True)
class YearVectors:
    score_share: list[float]
    matrix: list[list[float]]  # per week: [frp share, contrast share, confidence]
    frp: list[float]


def cutoff_week_for(year: int, month: int) -> int:
    """Complete 7-day weeks that fit before the end of `month` (week 52 also holds the year's last days, as in the notebook)."""
    days = [31, 29 if (year % 4 == 0 and (year % 100 or year % 400 == 0)) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return min(sum(days[:month]) // 7, 52)


def cosine_sim(v1: list[float], v2: list[float]) -> float:
    n1, n2 = math.sqrt(sum(x * x for x in v1)), math.sqrt(sum(x * x for x in v2))
    denom = n1 * n2
    return sum(a * b for a, b in zip(v1, v2)) / denom if denom > 1e-12 else 0.0


def dtw_sim_multifeature(m1: list[list[float]], m2: list[list[float]], weights=DTW_WEIGHTS, window: int = DTW_WINDOW) -> float:
    """Banded DTW over the (weeks x 3) matrices, allowing +/- `window` weeks of phase shift. Returns 0..1."""
    n = len(m1)
    if n == 0:
        return 0.0
    inf = math.inf
    d = [[inf] * (n + 1) for _ in range(n + 1)]
    d[0][0] = 0.0
    for i in range(1, n + 1):
        for j in range(max(1, i - window), min(n, i + window) + 1):
            cost = sum(w * abs(a - b) for w, a, b in zip(weights, m1[i - 1], m2[j - 1]))
            d[i][j] = cost + min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1])
    return min(1.0, max(0.0, 1.0 - d[n][n] / 2.0))


def year_vectors(by_week: dict[int, WeekSums], cutoff_week: int) -> YearVectors:
    """The notebook's build_year_vectors: weeks without data count as zero."""
    frp, score, temp, conf = [], [], [], []
    for w in range(1, cutoff_week + 1):
        s_frp, s_score, s_temp, s_conf, n = by_week.get(w, (0.0, 0.0, 0.0, 0.0, 0))
        frp.append(s_frp)
        score.append(s_score)
        temp.append(s_temp / n if n else 0.0)
        conf.append(s_conf / n if n else 0.0)
    fs, sf, st = sum(score) + EPS, sum(frp) + EPS, sum(temp) + EPS
    frp_share = [x / sf for x in frp]
    temp_share = [x / st for x in temp]
    return YearVectors([x / fs for x in score], [[a, b, c] for a, b, c in zip(frp_share, temp_share, conf)], frp)


def rank_similar_years(weeks: Weeks, target_year: int, cutoff_week: int) -> list[dict]:
    """Past years ordered from most to least like `target_year` over weeks 1..cutoff_week."""
    target = year_vectors(weeks.get(target_year, {}), cutoff_week)
    rows = []
    for year in sorted(y for y in weeks if y < target_year):
        cand = year_vectors(weeks[year], cutoff_week)
        if sum(cand.frp) <= 0:
            continue
        cos = cosine_sim(target.score_share, cand.score_share)
        dtw = dtw_sim_multifeature(target.matrix, cand.matrix)
        score = 100.0 * (0.5 * cos + 0.5 * dtw)
        rows.append(
            {
                "year": year,
                "scorePct": round(score, 2),
                "marginPct": round(100.0 - score, 2),
                "cosinePct": round(cos * 100.0, 2),
                "dtwPct": round(dtw * 100.0, 2),
                "cumFrpMw": round(sum(cand.frp), 1),
            }
        )
    return sorted(rows, key=lambda r: (-r["scorePct"], -r["year"]))


def weekly_frp(by_week: dict[int, WeekSums], weeks: int) -> list[float]:
    return [round(by_week.get(w, (0.0, 0, 0, 0, 0))[0], 1) for w in range(1, weeks + 1)]


def fire_so_far_pct(weeks: Weeks, target_year: int, cutoff_week: int) -> float:
    """FRP of the target year up to the cut-off as a share of the typical (median) whole earlier year, in percent.

    The similarity score compares shapes, so it says little when almost no fire has happened yet in the compared weeks
    (a wet season, for example). This is the number that tells the two cases apart."""
    totals = sorted(sum(v[0] for v in by.values()) for y, by in weeks.items() if y < target_year)
    totals = [t for t in totals if t > 0]
    if not totals:
        return 0.0
    mid = len(totals) // 2
    typical = totals[mid] if len(totals) % 2 else (totals[mid - 1] + totals[mid]) / 2
    so_far = sum(weeks.get(target_year, {}).get(w, (0.0,))[0] for w in range(1, cutoff_week + 1))
    return round(100.0 * so_far / typical, 1)


def usable_target_years(weeks: Weeks, min_weeks: int = 4) -> list[int]:
    """Years that can be compared with an earlier one: enough weeks with data and at least one earlier year."""
    years = sorted(y for y, by in weeks.items() if sum(1 for v in by.values() if v[4] > 0) >= min_weeks)
    return years[1:]


def last_data_week(by_week: dict[int, WeekSums]) -> int:
    return max((w for w, v in by_week.items() if v[4] > 0), default=0)


def default_cutoff_month(year: int, by_week: dict[int, WeekSums]) -> int | None:
    """The latest month that ends inside the target year's data (at least a month of it)."""
    last = last_data_week(by_week)
    best = None
    for m in range(1, 13):
        if cutoff_week_for(year, m) <= last:
            best = m
    return best
