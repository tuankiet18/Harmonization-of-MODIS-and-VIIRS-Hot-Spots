# Deploy with Docker (web + api)

Two containers: `web` (nginx serving the built site and proxying `/api` and `/health`) and `api` (FastAPI + DuckDB, includes the
`/api/explain` AI hook). Only `web` publishes a port; `api` is reachable from nginx only.

```
browser -> web:80 (nginx) -> /api/*  -> api:8000
                          -> others  -> static site
```

## Run (any machine with Docker)

```bash
docker compose build
docker compose run --rm api python scripts/make_sample_data.py --out /srv/data/sample   # first run only: SYNTHETIC data
docker compose up -d
```

Open `http://localhost` (set `WEB_PORT=8080` to use another port). Check `curl localhost/health`.

On Windows Git Bash prefix the `run` line with `MSYS_NO_PATHCONV=1`, otherwise `/srv/...` is rewritten into a Windows path.

## Settings

Put these in a `.env` next to `docker-compose.yml` (git ignores it). All are optional.

| Variable | Default | Meaning |
|---|---|---|
| `WEB_PORT` | `80` | Host port for the site |
| `EXPLAIN_PROVIDER` | `template` | `llm` needs the AI teammates' `LlmExplainer` (see `backend/README.md`); until then it returns 501 |
| `ANTHROPIC_API_KEY` | empty | Passed to the api container only, never to the browser |
| `EXPLAIN_RATE_PER_MIN` | `10` | Per-visitor limit on `/api/explain` |
| `CORS_ORIGINS` | `http://localhost` | Only matters if the browser calls the api from another origin |

## Real data

The api reads Parquet files from the `fire-data` volume (`/srv/data/sample`): `monthly.parquet`, `daily.parquet`,
`points.parquet`, `meta.json` (contract: `docs/DATA_CONTRACT.md`). To replace the synthetic data:

```bash
docker compose cp ./my-data/. api:/srv/data/sample/
docker compose restart api
```

Set `"isMock": false` in `meta.json` to remove the demo banner.

The sample data follows the data team's method (see `docs/DATA_CONTRACT.md`). After pulling a version that changes the method, rebuild and
regenerate it, otherwise the volume keeps the old numbers: `docker compose build && docker compose run --rm api python scripts/make_sample_data.py --out /srv/data/sample`.

## EC2 checklist

1. Linux instance with Docker and the compose plugin; clone the repo.
2. Security group: allow 80 (and 443 if you add HTTPS) from the internet, 22 from your IP only. Do not open 8000.
3. Run the three commands above. `restart: unless-stopped` brings it back after a reboot.
4. HTTPS: put Caddy or an AWS load balancer with a certificate in front of `web`; plain nginx here serves HTTP only.
5. The rate limiter is in memory, so it only holds for one `api` instance.

## Real hexagon data in Docker

Build the per-month hex files from the data team's parquet straight into the volume, then restart the api:

```bash
docker compose run --rm --no-deps -v "<folder with the parquet files>:/in:ro" api python scripts/build_hex_months.py --src "/in/**/*.parquet" --out /srv/data/sample/hex
docker compose restart api
```

On Windows Git Bash prefix the first line with `MSYS_NO_PATHCONV=1`. Months without a file show no hexagons; see `backend/README.md`.

## How the site gets its data

The site reads `/api/meta`, `/api/monthly`, `/api/daily` and `/api/points` (`web/src/data/ApiDataSource.ts`). Which source is used is
decided when the site is built by `VITE_DATA_SOURCE`:

- Docker builds with `api` (default). Use `VITE_DATA_SOURCE=mock docker compose build web` for the built-in demo data.
- Netlify and GitHub Pages build without it, so they keep the demo data (a static host has no backend).
- Local dev against the backend: start the api on port 8000, then `VITE_DATA_SOURCE=api npm run dev` in `web/` (the dev server proxies
  `/api`; set `API_TARGET` for another address).

The CSV download is still built in the browser from the monthly rows; the backend's `/api/export.csv` is not used yet.

## Known gaps

- The synthetic sample has daily totals only from 2024-01 and detection points only for the last three months, so older months show
  "No detections this month" on the map. Real data removes this.
- There is no separate AI container: the AI part is `/api/explain` inside `api`, and the site does not call it yet.
