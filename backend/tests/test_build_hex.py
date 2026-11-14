import duckdb

import build_hex_months as bhm  # scripts/ is on sys.path (see conftest)


def _write_input(path):
    """Rows shaped like the data team's step-2 parquet: one row per (date, day/night, sensor, H3 cell, country)."""
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t AS SELECT * FROM (VALUES
          (DATE '2001-03-01', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad',  2, 'nominal'),
          (DATE '2001-03-01', 'N', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad',  1, 'high'),
          (DATE '2001-03-05', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad',  3, 'nominal'),
          (DATE '2001-03-31', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad',  1, 'nominal'),
          (DATE '2001-03-02', 'D', 'MODIS', '87bbbbbbbffffff', 11.0, 21.0, 'Chad',  4, 'low'),
          (DATE '2001-03-02', 'D', 'VIIRS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad',  5, 'nominal'),
          (DATE '2001-04-09', 'D', 'MODIS', '87ccccccaffffff', 12.0, 22.0, 'Niger', 1, 'nominal')
        ) AS v(acq_date, daynight, sensor_family, h3_res7, center_lat, center_lon, country, point_count, conf_tier)"""
    )
    con.execute(f"COPY t TO '{path.as_posix()}' (FORMAT PARQUET)")


def _read(out, ym):
    con = duckdb.connect()
    rows = con.execute(
        f"SELECT h3_res7, sensor, country, days_mask, points FROM read_parquet('{out.as_posix()}/ym={ym}/*.parquet') ORDER BY h3_res7, sensor"
    ).fetchall()
    return rows


def test_one_row_per_cell_sensor_month_with_a_day_bitmask(tmp_path):
    src, out = tmp_path / "in.parquet", tmp_path / "hex"
    _write_input(src)
    bhm.build_hex_months(src.as_posix(), out)
    rows = _read(out, "2001-03")
    modis = next(r for r in rows if r[1] == "modis" and r[0] == "87aaaaaaaffffff")
    # Fire on days 1 (day and night pass collapse into one day), 5 and 31 -> bits 0, 4, 30.
    assert modis[3] == (1 << 0) | (1 << 4) | (1 << 30)
    assert bin(modis[3]).count("1") == 3
    assert modis[4] == 2 + 1 + 3 + 1  # detections are summed
    viirs = next(r for r in rows if r[1] == "viirs")
    assert viirs[3] == 1 << 1 and viirs[4] == 5


def test_low_confidence_is_dropped_unless_asked_for(tmp_path):
    src, out, out_all = tmp_path / "in.parquet", tmp_path / "hex", tmp_path / "hex_all"
    _write_input(src)
    bhm.build_hex_months(src.as_posix(), out)
    bhm.build_hex_months(src.as_posix(), out_all, keep_low_confidence=True)
    assert "87bbbbbbbffffff" not in {r[0] for r in _read(out, "2001-03")}
    assert "87bbbbbbbffffff" in {r[0] for r in _read(out_all, "2001-03")}


def test_months_are_separate_partitions_and_the_summary_counts_them(tmp_path):
    src, out = tmp_path / "in.parquet", tmp_path / "hex"
    _write_input(src)
    summary = bhm.build_hex_months(src.as_posix(), out)
    assert [r[2] for r in _read(out, "2001-04")] == ["Niger"]
    assert summary["months"] == ["2001-03", "2001-04"] and summary["rows"] == 3  # the low-confidence row is dropped
