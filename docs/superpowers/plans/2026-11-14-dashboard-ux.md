# Dashboard UX Redesign (Option A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FireCalendar dashboard readable in 5 seconds by a non-expert: answer first, one way to pick a month, plain English, secondary features folded into a collapsed "Details" section.

**Architecture:** Same two-column layout (map left, results right). The right column is reordered into Toolbar → Summary (verdict) → "how to read" line → Calendar → collapsed Details. Two small pure helpers (`verdictOf`, `presetRange`) carry the testable logic; everything else is component and copy changes. English only: the VI dictionary and language toggle are removed.

**Tech Stack:** React 19, TypeScript, Tailwind v4, MapLibre, ECharts, Vitest (existing).

**Spec:** `docs/superpowers/specs/2026-11-14-dashboard-ux-design.md`

## Global Constraints

- English-only UI: no language toggle, no Vietnamese strings, no `localStorage` language key.
- No new dependencies. Keep React + Tailwind + MapLibre + ECharts.
- Main view (Details collapsed) must not contain the words: `Harmonized`, `MODIS`, `VIIRS`, `NRT`, `calibration`, `grid cell`, `scale factor`, `hotspot`. They may appear inside Details and in the footer line.
- Verdict and status must use text plus a glyph, never colour alone. Keep touch targets ≥ 44 px (`pointer-coarse:` classes in `ui.ts`).
- Keep the `DEMO DATA` banner when `meta.isMock`. Keep dashed outline for preliminary months and italic grey for MODIS-only years in the calendar.
- Defaults: series `harmonized`, period = all data, calendar mode `count`, region Amazon.
- Verdict threshold: `|anomaly| < 10 %` means "About usual" (same as today's Summary).
- Do not commit unless the user asks. Never add `Co-Authored-By` or "Generated with Claude Code" lines.
- UI has no DOM test setup and none is added: UI tasks are verified with `npm run build` plus the browser pane (`preview_start` name `web-dev`, defined in `.claude/launch.json`). Pure logic gets Vitest tests in `web/tests/lib.test.ts`.

## Review Focus

- **No area chosen (cleared):** Toolbar shows "No area chosen", Download disabled, no crash. Checked in Task 8 step 4.
- **Period too short for a baseline (< 2 years or one year only):** verdict is `unknown`, headline falls back to `headNoBase`, no `NaN`. Pinned by Task 3 test `verdictOf(null)` and Task 8 browser check with the 5-year preset on a custom 1-month range.
- **User switches to a raw series in Details, then collapses it:** the main view must say which series it shows and offer a way back. Task 8 step 3.
- **Preset longer than the data (e.g. last 10 years with 3 years of data):** start clamps to the first month, never before it. Pinned by Task 4 test.
- **390 px width:** Toolbar (two pickers, three presets, download) wraps, no horizontal scroll. Task 8 step 5.

---

### Task 1: English only

**Files:**
- Modify: `web/src/i18n/index.tsx`, `web/src/data/regions.ts`, `web/src/App.tsx`, `web/src/components/MapControls.tsx`, `web/src/components/MapPanel.tsx`

**Interfaces:**
- Produces: `useI18n()` returns `{ t, months, monthsLong, fmt, fmtCompact, fmtPct, fmtMonth, monthInSentence, fmtDay, weekdays }` (no `lang`, no `setLang`); `Region.name: string`; no `Lang` type export.

- [ ] **Step 1:** In `regions.ts` change `name: { en: string; vi: string }` to `name: string` and keep each region's English name.
- [ ] **Step 2:** In `i18n/index.tsx` delete the `vi` dictionary, `Lang`, `dicts`, `initialLang`, the `lang` state and `setLang`; format with `'en-US'`; `fmtMonth` returns `"September 2019"`, `fmtDay` returns `"Oct 5, 2026"`, `monthInSentence(m)` returns the long English name. Keep `I18nProvider` and `document.documentElement.lang = 'en'`.
- [ ] **Step 3:** Update call sites: `region.name`, remove `lang` from `MapControls`/`MapPanel` (MapPanel label effect no longer depends on `lang` but must still set label text once labels exist), and in `App.tsx` delete the `Segmented<Lang>` toggle and the `Lang` import. `place` becomes `(region && (region.enInSentence ?? region.name)) || t('placeCustom')`.
- [ ] **Step 4:** Run `cd web && npm run build`. Expected: passes. Run `grep -rniE "lang\b|'vi'|setLang" web/src`. Expected: only `document.documentElement.lang`.

### Task 2: Plain-language copy

**Files:**
- Modify: `web/src/i18n/index.tsx` (the `en` dictionary)

**Interfaces:**
- Produces: dictionary keys below (existing keys change text; **new** keys are marked). Later tasks call them through `t(key, vars)`.

- [ ] **Step 1:** Set these exact strings (placeholders in braces unchanged in meaning):

| Key | Text |
|---|---|
| `appSubtitle` | `Fire history for any place on Earth, 2000 to today` |
| `headMore` | `{month} had {pct}% more fire detections than a typical {m} in {place}.` |
| `headFewer` | `{month} had {pct}% fewer fire detections than a typical {m} in {place}.` |
| `headNear` | `{month} was about a typical {m} in {place}.` |
| `headNoBase` | `{month} in {place}: {n} fire detections.` |
| `headSub` | `Typical means the median of {m} in all other years: {med} detections. This month: {val}.` |
| `latestNote` | `Showing the latest month. Click any square in the calendar to look at another month.` |
| `factPeakYearSub` | `{n} detections` |
| `factTotal` | `Fire detections in this period` |
| `factTotalSub` | `Across the selected area and dates` |
| `modeCount` / `modeAnomaly` | `Fire detections` / `Compared with usual` |
| `modisOnlyYears` | `{from}–{to}: older, lower-detail record` |
| `legendSelected` | `Selected month` |
| `legendNrt` | `Preliminary, may change` |
| `hotspots` | `fire detections` |
| `historicalMedian` / `vsMedian` | `Typical for this month` / `compared with typical` |
| `trendTitle` | `Monthly fire detections over time` |
| `noDataTitle` | `No fire detections in this area and period` |
| `loading` | `Loading fire history` |
| `periodTitle` | `Period` |
| `srcHarmonized` / `srcModis` / `srcViirs` | `Combined series (recommended)` / `MODIS sensor only` / `VIIRS sensor only` |
| **new** `verdictHigher` / `verdictTypical` / `verdictLower` / `verdictUnknown` | `Higher than usual` / `About usual` / `Lower than usual` / `No comparison yet` |
| **new** `howToReadCount` | `How to read this: each square is one month. Darker means more fire detections.` |
| **new** `howToReadAnomaly` | `How to read this: each square is one month. Orange is more than usual, blue is less than usual.` |
| **new** `areaLabel` / `noArea` | `Area` / `No area chosen` |
| **new** `presetAll` / `presetTen` / `presetFive` | `All years` / `Last 10 years` / `Last 5 years` |
| **new** `detailsTitle` | `Details and data quality` |
| **new** `detailsIntro` | `Satellites changed over the years, so older counts were converted to be comparable with recent ones. The calendar uses this combined series.` |
| **new** `showPoints` | `Show fire points on the map for the selected month` |
| **new** `rawNotice` | `Showing {series} only, not the combined series.` |
| **new** `rawBack` | `Back to combined series` |

Delete the keys `language`, `mapMonthLabel` and `mapDayLabel` after `grep -rn` confirms nothing but the old `App.tsx` map card and language toggle used them (Task 8 removes those; do the deletion at the end of Task 8 if a reference still exists). Keep `prevMonth`, `nextMonth`, `prevDay`, `nextDay`, `mapCaption*`, `wholeMonth`, `dailyTitle`, `dailyHint`, and all `explain*`/`conv*`/`lim*`/`badge*` keys (they live in Details).

- [ ] **Step 2:** Run `cd web && npm run build`. Expected: passes.

### Task 3: `verdictOf`

**Files:**
- Modify: `web/src/lib/stats.ts`
- Test: `web/tests/lib.test.ts`

**Interfaces:**
- Produces: `export type Verdict = 'higher' | 'typical' | 'lower' | 'unknown'`; `export function verdictOf(anomalyPct: number | null): Verdict`.

- [ ] **Step 1:** Add a test `describe('verdictOf')` asserting: `verdictOf(null) === 'unknown'`; `verdictOf(0) === 'typical'`; `verdictOf(9.99) === 'typical'`; `verdictOf(-9.99) === 'typical'`; `verdictOf(10) === 'higher'`; `verdictOf(64) === 'higher'`; `verdictOf(-10) === 'lower'`.
- [ ] **Step 2:** Run `cd web && npx vitest run tests/lib.test.ts`. Expected: FAIL (`verdictOf` not exported).
- [ ] **Step 3:** Implement in `stats.ts` with the rule from Global Constraints.
- [ ] **Step 4:** Run the same command. Expected: all tests PASS (including the 9 existing).

### Task 4: Period presets

**Files:**
- Create: `web/src/lib/range.ts`
- Test: `web/tests/lib.test.ts`

**Interfaces:**
- Consumes: `DateRange` from `../data/types`.
- Produces: `export type PeriodPreset = 'all' | 5 | 10`; `export function presetRange(limits: { min: string; max: string }, preset: PeriodPreset): DateRange`; `export function activePreset(range: DateRange, limits: { min: string; max: string }): PeriodPreset | null`.

- [ ] **Step 1:** Tests with `limits = { min: '2000-11', max: '2026-10' }`: `presetRange(limits, 'all')` equals `{ start: '2000-11', end: '2026-10' }`; `presetRange(limits, 10)` equals `{ start: '2016-11', end: '2026-10' }` (exactly 120 months inclusive); `presetRange(limits, 5)` equals `{ start: '2021-11', end: '2026-10' }`; with `{ min: '2024-01', max: '2026-10' }`, `presetRange(..., 10).start === '2024-01'` (clamped); `activePreset({ start: '2016-11', end: '2026-10' }, limits) === 10`; `activePreset({ start: '2010-01', end: '2012-01' }, limits) === null`.
- [ ] **Step 2:** Run `cd web && npx vitest run tests/lib.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement. Work in month indices (`year*12 + month-1`) so no `Date` timezone issues; `activePreset` checks `'all'` first, then 10, then 5.
- [ ] **Step 4:** Run the same command. Expected: PASS.

### Task 5: Summary with verdict and month arrows

**Files:**
- Modify: `web/src/components/Summary.tsx`

**Interfaces:**
- Consumes: `verdictOf` (Task 3); copy keys (Task 2).
- Produces: `Summary` props `{ point: MonthlyPoint; all: MonthlyPoint[]; source: Source; place: string; range: Kpis; isLatest: boolean; onStep: (dir: -1 | 1) => void; canPrev: boolean; canNext: boolean }` (props `cells` and `monthCount` removed).

- [ ] **Step 1:** Replace the inline `Math.abs(anom) < 10` logic with `verdictOf(anom)`; choose headline and tone from the verdict (`unknown` → `headNoBase`).
- [ ] **Step 2:** Render above the headline a verdict pill: glyph (`▲` higher, `■` typical, `▼` lower, `–` unknown, `aria-hidden`) plus `t('verdict…')`, coloured with the existing `ember`/`cool`/`line` tokens. Beside the headline render previous/next buttons (`toolIcon`, `IconPrev`/`IconNext`, `aria-label` from `prevMonth`/`nextMonth`, disabled by `canPrev`/`canNext`, call `onStep(-1|1)`).
- [ ] **Step 3:** Third fact uses `factTotalSub` without variables.
- [ ] **Step 4:** `cd web && npm run build` (will fail on `App.tsx` call site until Task 8; run `npx tsc --noEmit` and expect only the `App.tsx` error). 

### Task 6: Toolbar

**Files:**
- Create: `web/src/components/Toolbar.tsx`
- Modify: `web/src/components/MapControls.tsx` (add `id="region-select"` to the region `<select>`)

**Interfaces:**
- Consumes: `MonthPicker` (existing props `label, value, min, max, onChange`), `presetRange`/`activePreset` (Task 4), `btnSolid`, `btn`, `IconDownload`.
- Produces: `export default function Toolbar(props: { areaName: string | null; range: DateRange; limits: { min: string; max: string }; onRange: (r: DateRange) => void; canDownload: boolean; onDownload: () => void })`.

- [ ] **Step 1:** Implement a sticky bar (`sticky top-0 z-10`, wrapping with `flex-wrap`, same blurred surface as today's period bar). Content in order: area button (shows `areaName ?? t('noArea')`, label `t('areaLabel')`, on click focuses `#region-select`); the two `MonthPicker`s keeping today's clamp rule (changing one end pushes the other end); three preset chips (`t('presetAll'|'presetTen'|'presetFive')`, `aria-pressed` from `activePreset`); Download CSV button (`btnSolid`, disabled unless `canDownload`).
- [ ] **Step 2:** `npx tsc --noEmit`. Expected: no errors from `Toolbar.tsx`.

### Task 7: Details section

**Files:**
- Create: `web/src/components/Details.tsx`

**Interfaces:**
- Consumes: `ExplainPanel`, `TrendChart`, `DailyCalendar` (unchanged props), `Segmented`.
- Produces: `export default function Details(props: { point: MonthlyPoint; inRange: MonthlyPoint[]; source: Source; onSource: (s: Source) => void; meta: DataMeta | null; focus: string | null; onSelect: (ym: string) => void; daily: DayPoint[]; day: number | null; onPickDay: (d: number | null) => void; showPoints: boolean; onShowPoints: (v: boolean) => void; caption: string })`.

- [ ] **Step 1:** Implement with a native `<details>` (closed by default) and a `<summary>` styled as a full-width button showing `t('detailsTitle')`. Body order: `detailsIntro`; `ExplainPanel`; `Segmented<Source>` (label `srcLabel`, three options from `srcHarmonized/srcModis/srcViirs`); trend section (`trendTitle` + `TrendChart`); `DailyCalendar` when `daily.length > 0`; checkbox `showPoints` with `caption` shown under it only when checked.
- [ ] **Step 2:** `npx tsc --noEmit`. Expected: no errors from `Details.tsx`.

### Task 8: Assemble App and verify in the browser

**Files:**
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: Tasks 1–7.

- [ ] **Step 1:** In `App.tsx`: remove the language toggle and header Download button (header keeps logo, title, subtitle); remove the map month card block and `step`-on-map logic; add state `showPoints` (default `false`) and fetch points only when `showPoints` (otherwise `NO_POINTS`; `MapPanel` gets `points={showPoints ? sample.points : []}`); `onStep(dir)` moves the selected month through `withValue` (`canPrev = focusIdx > 0`, `canNext = focusIdx < withValue.length - 1`) and clears `dayPick`; remove the `cells` memo.
- [ ] **Step 2:** Right column order for the data state: `Toolbar` → `Summary` → raw-series notice (only when `source !== 'harmonized'`: `rawNotice` with `{series}` = `srcModis`/`srcViirs` text, plus a `rawBack` button that sets `source` to `'harmonized'`) → how-to-read line (`howToReadCount` or `howToReadAnomaly` by `mode`) → calendar section with the mode `Segmented` → `Details`. Empty, error, loading and no-data states keep the Toolbar above them. `Toolbar.areaName` is the region name, `t('customArea')` for `custom`, otherwise `null`; `canDownload = hasData`.
- [ ] **Step 3:** Run `cd web && npm run build && npx vitest run`. Expected: build passes; all tests pass.
- [ ] **Step 4:** In the browser pane at 1440×900 (`preview_start` `web-dev`): run JS `document.querySelector('main').innerText` and confirm none of the banned words from Global Constraints appear while Details is collapsed (ignore the footer paragraph, which is allowed to name the sources); confirm headline, verdict pill, three facts and the calendar header are visible without scrolling the right column past one screen; open Details and confirm explain panel, source switch, trend chart, daily calendar and the points checkbox work; click Clear area and confirm "No area chosen", disabled Download, and the empty state; draw an area and enter coordinates and confirm the toolbar shows "Custom area"; choose each preset and confirm the calendar rows change.
- [ ] **Step 5:** Pick "MODIS sensor only" in Details, collapse Details, confirm the raw-series notice appears and "Back to combined series" restores the default.
- [ ] **Step 6:** Resize to 390×844 (`mobile` preset): confirm order toolbar → map → verdict → facts → calendar → Details, no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), preset chips and month pickers wrap. Reset the viewport with the `desktop` preset. Take before/after screenshots at 1440 and 390 and report what could not be checked.
