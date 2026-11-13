# FireCalendar — web app

Harmonized MODIS + VIIRS burning-activity calendar (NASA Space Apps 2026). Vite + React + TypeScript, Tailwind CSS v4, MapLibre, ECharts. No backend.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for aggregation / median / anomaly / CSV
npm run build    # type-check + production build into dist/
```

## Structure
- `src/data/` — `types.ts` (data contract), `MockDataSource.ts` (fake data), `index.ts` (**swap the data source here**), `regions.ts` (presets)
- `src/lib/` — `aggregate.ts`, `stats.ts` (historical median, anomaly, KPIs), `csv.ts`, `theme.ts`
- `src/components/` — map + AOI drawing, calendar heatmap, trend chart, headline summary, "why did this change" panel, map controls
- `src/i18n/` — EN / VI dictionaries

## Plugging in real data
See `../docs/DATA_CONTRACT.md`. Implement `DataSource` (`meta()`, `query(bbox)`, `points(bbox, yearMonth, source)`) and export it from `src/data/index.ts`.

## Notes
- Basemap: OpenStreetMap tiles greyed out (no API key). Fine for demo-level traffic.
- Design: light "field map" theme (Tailwind v4; design tokens in the `@theme` block of `src/styles.css`, chart/map colours mirrored in `src/lib/theme.ts`; shared button/field classes in `src/components/ui.ts`). The whole UI follows one month in focus: calendar, map hotspots, headline and explanation.
