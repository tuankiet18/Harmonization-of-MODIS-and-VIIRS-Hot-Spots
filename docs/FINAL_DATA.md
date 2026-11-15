# Final data: how to build it and how to run it

The app reads the data team's **per-year harmonized files** (`harmonize_final/2000.parquet` … `2025.parquet`, 25 columns, about
12 GB, 308 million rows). They are turned into small tables once; the API never reads the big files while serving.

## 1. Build (one command)

Unzip the Drive download so that one folder holds `YYYY.parquet`, then:

```bash
cd backend
python scripts/build_final_data.py --src C:/nasa-data/harmonize_final --out C:/nasa-data/final
```

| Output in `--out` | Built by | Used for |
|---|---|---|
| `hex/ym=YYYY-MM/*.parquet` | `build_hex_months.py` | the map, the monthly and daily series (cell-days per sensor) |
| `hex/monthly_bins.parquet` | `build_monthly_bins.py` | the monthly series of areas at least 2 degrees wide, in milliseconds |
| `hex/monthly_countries.parquet` | `build_monthly_bins.py` | the monthly series of a country by its borders (the `country` column) |
| `cells/ym=YYYY-MM/*.parquet` | `build_cells.py` | the temperature map and the "Fire cells" CSV (hottest `bright_mir` per cell-day) |
| `analog_weekly.parquet`, `analog_weekly_country.parquet`, `analog_meta.json` | `build_analog_weekly.py` | the Similar years tab (by box or by country) |

About 3 GB of output; roughly 30 to 60 minutes. `--only hex bins cells analog` runs single steps, `--years 2020 2021` a few years.

## 2. What the numbers mean (so they can be defended)

- **Unit:** the cell-day, one 5 km² H3 res7 cell with at least one detection on one day. Day and night passes and several
  satellites seeing the same cell the same day count once.
- **Filters:** vegetation fires only (`type = 0`), low-confidence points removed (`conf_l`).
- **Satellites:** MODIS estimated onto the VIIRS scale (`record_origin = MODIS_ESTIMATED_VIIRS_LIKE`, Terra from 2000-11, Aqua from 2002-07)
  counts as *modis*; Suomi NPP (`OBSERVED_VIIRS`, from 2012-02) counts as *viirs*. **NOAA-20 is left out**: a second VIIRS satellite
  adds overpasses and raised the world's cell-days by 40 to 50 % from 2018 without any change in fire.
- **Combined series:** before 2012-02 the MODIS count is multiplied by a per-calendar-month factor (S-NPP / MODIS, fitted 2012-02 to 2022-12 for
  the chosen area); from 2012-02 S-NPP is used as it is. Before 2002-07 only Terra flew, so those months have no combined value.
- **Gaps:** a few days are missing in 2001-06/07 and 2002-03/04 (Terra offline). The record ends 2025-12.
- **Area:** a country follows its real borders in the calendar, the trend charts, the daily calendar, Similar years and the monthly and daily CSV
  files (the `country` column of the data; the web app maps the border countries to the data's names in `web/src/data/countryDataNames.ts`,
  and a country without a name there falls back to its box). The fire-cells CSV is cut to the borders in the browser. A drawn or typed
  rectangle is a rectangle. Rectangles at least 2 degrees wide and high use the 0.25 degree table (edge off by at most one bin);
  smaller ones read the hex files themselves and are exact but slower (a few seconds for a first look at a 1 degree box; tried sorting the
  files by H3 index: it did not make DuckDB skip any data, so it was dropped).
- **Temperature map:** `bright_mir`, the 4 µm channel, hottest reading per cell and day or month, in degrees Celsius. (`bright_tir` mostly
  follows the time of the overpass: 29 C by day, 15 C at night.)
- **Known limits:** Central Africa reads about 15 to 20 % lower after 2012 than before; Similar years still uses every satellite
  (including NOAA-20) and FRP of MODIS estimates, which sit on a different scale than VIIRS FRP.

## 3. Run it

Locally: `DATA_DIR=C:/nasa-data/final SERIES_SOURCE=hex uvicorn app.asgi:app` in `backend/`, and `VITE_DATA_SOURCE=api npm run dev` in `web/`.
With Docker, mount the folder over `/srv/data/sample` (see `docker-compose.override.yml` for the layout on the development machine).

On a server: `deploy/` has a production stack (Caddy for HTTPS, nginx, the API). Put the built folder at `/srv/firecalendar/data`, then

```bash
cd deploy
SITE_ADDRESS=1-2-3-4.nip.io docker compose -f docker-compose.prod.yml up -d --build
```

`deploy/ec2-user-data.sh` does this from a fresh Ubuntu 24.04 EC2 instance, pulling the code and the data from an S3 bucket
(`code.tar.gz`, `data/hex`, `data/cells`, `data/analog`). Size: `t3.large` (8 GB) with a 40 GB disk; open ports 80 and 443 only.
