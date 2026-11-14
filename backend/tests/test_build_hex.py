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


def _write_new_schema(path):
    """Rows in the data team's updated schema: `type`, per-tier point counts, brightness and FRP."""
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t AS SELECT * FROM (VALUES
          (DATE '2001-03-01', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 0, 330.0, 20.0, 2, 0, 'nominal'),
          (DATE '2001-03-01', 'N', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 0, 350.0,  5.0, 1, 0, 'nominal'),
          (DATE '2001-03-02', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 2, 400.0, 90.0, 4, 0, 'nominal'),
          (DATE '2001-03-03', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 0, 310.0,  8.0, 3, 3, 'low'),
          (DATE '2001-03-04', 'D', 'MODIS', '87aaaaaaaffffff', 10.0, 20.0, 'Chad', 0, 320.0, 10.0, 5, 2, 'nominal')
        ) AS v(acq_date, daynight, sensor_family, h3_res7, center_lat, center_lon, country, type, bright_mir, frp, point_count, conf_l, conf_tier)"""
    )
    con.execute(f"COPY t TO '{path.as_posix()}' (FORMAT PARQUET)")


def _cell(out, ym="2001-03"):
    con = duckdb.connect()
    return con.execute(
        f"SELECT days_mask, points, temp_max, frp_sum FROM read_parquet('{out.as_posix()}/ym={ym}/*.parquet') WHERE h3_res7 = '87aaaaaaaffffff'"
    ).fetchone()


def test_static_sources_and_low_confidence_points_are_removed_exactly(tmp_path):
    src, out = tmp_path / "new.parquet", tmp_path / "hex"
    _write_new_schema(src)
    bhm.build_hex_months(src.as_posix(), out)
    mask, points, temp, frp = _cell(out)
    # Day 1 (day and night pass), day 4 (3 of its 5 points are good). Day 2 is a static source, day 3 is all low confidence.
    assert mask == (1 << 0) | (1 << 3)
    assert points == 2 + 1 + (5 - 2)
    assert temp == 350.0 and frp == 20.0 + 5.0 + 10.0


def test_keep_static_brings_type_2_back(tmp_path):
    src, out = tmp_path / "new.parquet", tmp_path / "hex"
    _write_new_schema(src)
    bhm.build_hex_months(src.as_posix(), out, keep_static=True)
    mask, points, temp, _ = _cell(out)
    assert mask == (1 << 0) | (1 << 1) | (1 << 3)
    assert points == 2 + 1 + 4 + 3 and temp == 400.0


def test_files_in_the_old_and_the_new_schema_can_be_built_together(tmp_path):
    folder, out = tmp_path / "in", tmp_path / "hex"
    folder.mkdir()
    _write_new_schema(folder / "new.parquet")
    old = folder / "old.parquet"
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE o AS SELECT * FROM (VALUES
          (DATE '2001-04-09', 'D', 'MODIS', '87ccccccaffffff', 12.0, 22.0, 'Niger', 1, 'nominal'),
          (DATE '2001-04-10', 'D', 'MODIS', '87ccccccaffffff', 12.0, 22.0, 'Niger', 1, 'low')
        ) AS v(acq_date, daynight, sensor_family, h3_res7, center_lat, center_lon, country, point_count, conf_tier)"""
    )
    con.execute(f"COPY o TO '{old.as_posix()}' (FORMAT PARQUET)")
    bhm.build_hex_months((folder / "*.parquet").as_posix(), out)
    # The old file has no type and no per-tier counts: its low-confidence row is dropped by the tier instead.
    assert [r[3] for r in _read(out, "2001-04")] == [1 << 8]
    assert _cell(out)[0] == (1 << 0) | (1 << 3)
