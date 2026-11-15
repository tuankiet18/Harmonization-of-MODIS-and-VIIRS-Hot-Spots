# FireCalendar

One consistent fire calendar from MODIS and VIIRS hotspots, 2000 to 2025.
NASA Space Apps Challenge 2026, challenge **Harmonization of MODIS and VIIRS Hot Spots** (team TH).

Live demo: https://18-141-67-33.nip.io (a small EC2 instance; it may be offline after the event).

## The problem

NASA's fire hotspots come from two generations of satellites. MODIS (Terra and Aqua, 1 km pixels, since 2000) is ending its
science mission around 2027; VIIRS (375 m, since 2012) is finer and sees small fires MODIS misses. Adding both up makes fire
look like it triples in 2012 and rises again from 2018, when a second VIIRS satellite (NOAA-20) arrives. None of that is real.
Fire managers, land managers, responders and scientists need one history they can compare year to year.

## What it does

- **Calendar of burning activity** for any area: a country by its real borders, a drawn rectangle, or typed coordinates.
  One unit everywhere, the *cell-day*: a 5 km² H3 (resolution 7) cell with at least one detection on one day.
- **Overview, Calendar and Similar years tabs.** A map of fire hexagons (dots when zoomed out), monthly and daily calendars,
  each month against the median of the same month in other years, busiest month and year, and past years whose season looks most
  like this one (Sakoe-Chiba DTW from the data team's notebook).
- **Temperature map** (Calendar tab): hottest mid-infrared brightness temperature (`bright_mir`, Celsius) per cell, for a day or a month.
- **Downloads:** CSV of monthly totals, daily totals and every fire cell; any chart as a PNG; a share link that keeps the state.

## How the series is built

1. The data team converts MODIS observations onto the VIIRS scale with a 7-model GPU ensemble plus quantile mapping and tail
   calibration (57 features, pairs within 15 minutes). On 276,903 unseen pairs (2023 to 2025) the mid-infrared error falls 62.9 %,
   thermal 25.3 %, fire radiative power RMSE 55.8 %. See [docs/README.md](docs/README.md) and
   [docs/MODEL_GUIDE_GPU_ENSEMBLE_EQM_V2.md](docs/MODEL_GUIDE_GPU_ENSEMBLE_EQM_V2.md).
2. The app counts vegetation fires only (`type = 0`), drops low-confidence points, and counts a cell once per day.
3. Before 2012-02 the MODIS count is multiplied by a per-calendar-month factor (Suomi NPP / MODIS, fitted 2012 to 2022 for the
   area); from 2012-02 Suomi NPP is used as it is. NOAA-20 is left out: it adds overpasses, not fire.

Details and the reasoning behind each choice: [docs/FINAL_DATA.md](docs/FINAL_DATA.md).

**Known limits:** the world total still steps down about 18 % at 2012 (Vietnam stays flat; Central Africa also dips); the model only
converts fires MODIS saw, so tiny fires stay missed; 2000 to 2011 lies outside the model's training years; the largest fires read
low; a drawn area is a rectangle and small ones take a few seconds the first time; the record ends in December 2025.

## Layout

| Folder | What is in it |
|---|---|
| `web/` | React, MapLibre and ECharts front end (Vite, TypeScript, Tailwind) |
| `backend/` | FastAPI and DuckDB API; `scripts/` turn the data team's files into small tables |
| `deploy/` | Production stack (Caddy HTTPS, nginx cache, API), EC2 bootstrap script, load test |
| `docs/` | Data contract, data build and deploy notes, the data team's model README |
| `colab/` | The data team's notebooks |

The API never reads the 12 GB of source files while serving; it reads the tables built once from them.

## Run it locally

Without the real data the API can serve small synthetic data:

```bash
docker compose build
docker compose run --rm api python scripts/make_sample_data.py --out /srv/data/sample
docker compose up -d
```

Open http://localhost. On Windows Git Bash put `MSYS_NO_PATHCONV=1` before the `run` line.

With the real data (the data team's `YYYY.parquet` files, about 12 GB):

```bash
cd backend
python scripts/build_final_data.py --src <folder with YYYY.parquet> --out <output folder>   # 30 to 60 minutes, about 3 GB
DATA_DIR=<output folder> SERIES_SOURCE=hex uvicorn app.asgi:app                              # API on :8000
```

```bash
cd web
npm install
VITE_DATA_SOURCE=api npm run dev                                                             # site on :5173
```

Without `VITE_DATA_SOURCE=api` the site runs on built-in mock data and needs no server.

## Tests

```bash
cd backend && python -m pytest          # 107 tests
cd web && npm test && npx tsc --noEmit
```

## Deploy

[docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md) covers Docker on any machine. `deploy/` has the production stack
(`SITE_ADDRESS=<host> docker compose -f docker-compose.prod.yml up -d --build`) and `ec2-user-data.sh`, which sets up a fresh
Ubuntu EC2 instance from an S3 bucket. nginx caches answers, limits requests per visitor and queues heavy queries;
`deploy/loadtest.py` simulates many visitors.

## Data and credits

- NASA FIRMS active fire (MODIS on Terra and Aqua, VIIRS on Suomi NPP and NOAA-20), harmonized and aggregated to H3 res7 by the data team.
- Country borders: Natural Earth (world-atlas). Base map: OpenStreetMap contributors.
- Planned MODIS end dates: NASA LAADS DAAC.
