# FireCalendar API (backend scaffold)

FastAPI + DuckDB. It **reads** pre-computed Parquet files and never touches raw FIRMS CSV or fits a model on request.
Harmonization is done offline by the data/AI team (see [docs/GUIDE_GLOBAL_DATA.md](../docs/GUIDE_GLOBAL_DATA.md));
this service filters, sums and returns the result.

## Run locally

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt   # macOS/Linux: .venv/bin/pip
.venv\Scripts\python scripts/make_sample_data.py     # writes SYNTHETIC data to data/sample (about 4 MB, 7 s)
.venv\Scripts\python -m uvicorn app.asgi:app --reload --port 8000
.venv\Scripts\python -m pytest
```

Interactive docs: http://localhost:8000/docs

## Endpoints

All box parameters are `west, south, east, north` in degrees (`south < north`, `west < east`), matched against the
**cell centre**. Months are `YYYY-MM`. JSON fields are camelCase, the same names as `web/src/data/types.ts`.

| Method and path | Returns |
|---|---|
| `GET /health` | `{status, isMock}`. Open it before a demo to wake a sleeping instance. |
| `GET /api/meta` | Dataset version, method text, source, first and last month, `isMock`. |
| `GET /api/monthly?box` | One row per month: `modis, viirs, harmonized, cells, anyNrt, allInCalibration, methods, scaleFactor`. About 60 KB for any area. |
| `GET /api/daily?box&ym` | One row per day of that month. Days add up to the month. |
| `GET /api/points?box&ym[&source][&day][&limit]` | `{points: [{lat, lon, sensor}], total}`. A stable sample of at most `MAX_POINTS`, plus the true total. |
| `GET /api/hexes?box&from&to[&source][&day][&limit]` | `{cells: [{h3, days}], total, used}`. H3 res7 hexagons with fire over the period `from`..`to` (`YYYY-MM`), what the map draws; `days` = days with a detection summed over its months (a `day` needs `from` = `to`), `total` = cells with fire, `used` = cells returned (the cap is `MAX_HEXES`). |
| `GET /api/export.csv?box&start&end[&level=monthly\|daily][&series]` | CSV with a provenance header (method, version, source, area, period). |
| `POST /api/explain` | `{text, provider, facts}` for one month. Rate limited per client. |

Errors: `422` bad box or month, `404` no data for that month and area, `429` rate limit, `501` LLM provider not implemented.

## Data contract

Files in `DATA_DIR` (default `data/sample`), columns exactly as in [docs/DATA_CONTRACT.md](../docs/DATA_CONTRACT.md):

| File | One row per | Columns |
|---|---|---|
| `monthly.parquet` | grid cell and month | `cell_id, lat, lon, year_month, modis_raw, viirs_raw, harmonized, method, scale_factor, in_calibration, data_status` |
| `daily.parquet` | grid cell and day | `cell_id, lat, lon, date, ym, modis_raw, viirs_raw, harmonized` |
| `points.parquet` | detection | `lat, lon, date, ym, sensor, h3_res7` |
| `meta.json` | n/a | `version, method, source, gridDeg, updated, firstMonth, lastMonth, isMock` |

Unit and method follow the data team: counts are active cell-days, `harmonized` is MODIS times a monthly factor before 2013 (`method = modis_scaled`)
and S-NPP VIIRS as is from 2013 (`viirs_native`); details in [docs/DATA_CONTRACT.md](../docs/DATA_CONTRACT.md).

The sample data is synthetic: daily data exists only from 2024-01, and points only for the last three months, and
they are a sample (at most 40 per cell and sensor per month). Real data replaces these files, nothing else changes.
Set `isMock: false` in `meta.json` to remove the demo banner in the web app.

## Real hexagon data

`/api/hexes` reads the sample points table until a `hex/` folder exists next to the Parquet files. Build it from the data team's world H3 parquet
(see [docs/DATA_CONTRACT.md](../docs/DATA_CONTRACT.md)):

```bash
python scripts/build_hex_months.py --src "D:/data/parquet_h3_world/**/*.parquet" --out data/sample/hex
```

Restart the API afterwards. The script reads the data team's updated schema (`type`, `conf_l`/`conf_n`/`conf_h`) and the older one; it drops static sources (`type` other than 0) and low-confidence points, and keeps the hottest brightness temperature (`temp_max`) and summed FRP (`frp_sum`) of each cell and month. Set `SERIES_SOURCE=hex` to also draw the charts from these files, once they cover the months you want to show. The input is about 7 GB, so run it where the data lives (for example Colab with Drive mounted) and copy the output over.
On one small file the output was about 40% of the input size; a denser VIIRS year has not been measured.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `data/sample` | Folder with the files above |
| `SERIES_SOURCE` | `sample` | `sample` keeps `/api/monthly`, `/api/daily` and the CSV on the synthetic tables. `hex` computes them from the hex files (cell-days per sensor; before 2013 MODIS times a per-month factor fitted where both sensors have data in 2013-2022; from 2013 VIIRS). The API refuses to start with `hex` and no hex files |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed from a browser. Add the Netlify URL when deployed |
| `EXPLAIN_PROVIDER` | `template` | `template` needs no key. `llm` is the hook for the AI teammates |
| `EXPLAIN_RATE_PER_MIN` | `10` | Per-client limit for `/api/explain` |
| `MAX_POINTS`, `MAX_HEXES`, `MAX_EXPORT_ROWS` | `4000`, `8000`, `500000` | Server-side caps |

## For the AI teammates

`app/explain.py` computes the facts for a month (value, median of the same month in other years, anomaly, method, flags),
then explains them. The rule: **the model never invents numbers.** Implement `LlmExplainer.explain(facts, lang)`, pass it
only `facts`, keep the key in an environment variable, and set `EXPLAIN_PROVIDER=llm`. Until then `llm` returns `501`
so a missing implementation is never mistaken for a working one.

Other places that need your work: the real `monthly/daily/points` Parquet from the global pipeline, an `orbit_drift`
quality flag for MODIS from 2022 (needs a new column and a contract change), and the NRT months after 2025-12.

## Deploy

Container image: `docker build -t firecalendar-api .` then run with `-p 8000:8000`. Hosts such as Render and
Cloud Run inject `PORT`, which the image already honours. Before deploying:

- Put the real Parquet files where `DATA_DIR` points (a mounted volume, or baked into the image if small).
- Set `CORS_ORIGINS` to the frontend URL, and the AI key as a secret in the host's dashboard, never in the repo.
- The rate limiter is in memory, so it only holds for one instance.
- The image has not been built in this scaffold. Run the build once locally before relying on it.
