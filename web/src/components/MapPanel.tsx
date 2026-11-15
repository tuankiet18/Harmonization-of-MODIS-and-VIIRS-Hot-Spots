import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { REGIONS, WORLD_VIEW } from '../data/regions';
import { useI18n } from '../i18n';
import { hexColorExpression, hexGeoJson, dotsGeoJson, type HexStep, type HexValue } from '../lib/hex';
import { COLORS } from '../lib/theme';
import type { Bbox } from '../data/types';
import { countryMask, unwrapGeometry, type CountryGeometry } from '../lib/geo';

interface Props {
  bbox: Bbox | null;
  /** Increment to make the map fly to the current bbox (not for rectangles drawn on the map). */
  fitSignal: number;
  drawing: boolean;
  onDrawn: (b: Bbox) => void;
  cells: HexValue[];
  /** A country's borders, drawn instead of the rectangle when a country is selected. */
  outline: CountryGeometry | null;
  /** Increase `n` to fly to a place (a cell picked in the list beside the map). */
  flyTo: { lat: number; lon: number; n: number } | null;
  /** Called when the map settles after a move or zoom, so the cells in view can be fetched. */
  onView: (v: { zoom: number; lat: number; bounds: Bbox }) => void;
  /** Legend steps the cells are coloured by. */
  steps: HexStep[];
  /** What a cell's value means: days with fire (default) or a temperature in degrees Celsius. */
  valueKind?: 'days' | 'tempC';
  /** Few cells (one day): draw the dots bigger when zoomed out so they can be seen. */
  sparse?: boolean;
  onPickRegion: (id: string) => void;
}

// Load the worker as a real file: works in dev (pre-bundled deps) and in the production build.
maplibregl.setWorkerUrl(workerUrl);

const ring = (b: Bbox) => [[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]];
const rect = (b: Bbox): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(b)] } }],
});
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const PRESETS: FeatureCollection = {
  type: 'FeatureCollection',
  features: REGIONS.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring(r.bbox)] } })),
};
/** From this MapLibre zoom up, a res7 cell is wide enough (about 7 px) to be drawn as a hexagon. */
const DOT_ZOOM = 8;
// Dot size by zoom: it doubles per level like the cell itself; a day's few cells get a floor so they stay visible when zoomed out.
const DOT_RADIUS = ['interpolate', ['exponential', 2], ['zoom'], 2, 1.1, DOT_ZOOM, 3.4, DOT_ZOOM + 1, 6.8];
const DOT_RADIUS_SPARSE = ['interpolate', ['linear'], ['zoom'], 2, 3, 6, 4, DOT_ZOOM, 4.4, DOT_ZOOM + 1, 6.8];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function MapPanel({ bbox, fitSignal, drawing, onDrawn, cells, outline, onView, flyTo, steps, valueKind = 'days', sparse = false, onPickRegion }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const labels = useRef<{ id: string; el: HTMLButtonElement }[]>([]);
  const bboxRef = useRef(bbox);
  const cellsRef = useRef(cells);
  const outlineRef = useRef(outline);
  const onViewRef = useRef(onView);
  const stepsRef = useRef(steps);
  const kindRef = useRef(valueKind);
  const sparseRef = useRef(sparse);
  const drawingRef = useRef(drawing);
  const onDrawnRef = useRef(onDrawn);
  const onPickRef = useRef(onPickRegion);
  bboxRef.current = bbox;
  cellsRef.current = cells;
  outlineRef.current = outline;
  onViewRef.current = onView;
  stepsRef.current = steps;
  kindRef.current = valueKind;
  sparseRef.current = sparse;
  drawingRef.current = drawing;
  onDrawnRef.current = onDrawn;
  onPickRef.current = onPickRegion;

  const syncArea = () => {
    const m = map.current;
    if (!m) return;
    const b = bboxRef.current;
    const o = outlineRef.current;
    // A selected country is shown by its borders; any other area by its rectangle.
    (m.getSource('aoi') as GeoJSONSource | undefined)?.setData(b && !o ? rect(b) : EMPTY);
    (m.getSource('country') as GeoJSONSource | undefined)?.setData(o ? { type: 'Feature', properties: {}, geometry: unwrapGeometry(o) } : EMPTY);
    (m.getSource('mask') as GeoJSONSource | undefined)?.setData((o && countryMask(o)) || EMPTY);
    // Preset outlines and their labels are the way in when no area is chosen yet.
    m.setLayoutProperty('presets-line', 'visibility', b ? 'none' : 'visible');
    for (const l of labels.current) l.el.hidden = !!b;
  };
  const syncHexes = () => {
    const m = map.current;
    if (!m) return;
    (m.getSource('hexes') as GeoJSONSource | undefined)?.setData(hexGeoJson(cellsRef.current));
    (m.getSource('dots') as GeoJSONSource | undefined)?.setData(dotsGeoJson(cellsRef.current));
    m.setPaintProperty('hexes-fill', 'fill-color', hexColorExpression(stepsRef.current) as never);
    m.setPaintProperty('hexes-dots', 'circle-color', hexColorExpression(stepsRef.current) as never);
    m.setPaintProperty('hexes-dots', 'circle-radius', (sparseRef.current ? DOT_RADIUS_SPARSE : DOT_RADIUS) as never);
  };
  const fit = () => {
    const m = map.current;
    const b = bboxRef.current;
    if (!m) return;
    const pad = Math.min(96, Math.round(m.getContainer().clientHeight / 5));
    if (b) m.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: { top: pad, bottom: pad, left: 40, right: 40 }, duration: 700, maxZoom: 8 });
    else m.fitBounds([[-128, -42], [158, 66]], { padding: { top: pad, bottom: 24, left: 24, right: 24 }, duration: 700 });
  };

  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      center: WORLD_VIEW.center,
      zoom: WORLD_VIEW.zoom,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          base: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
            maxzoom: 19,
          },
        },
        // Standard OSM tiles, greyed out so the hotspots are the only strong colour (no API key needed).
        layers: [
          { id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': -0.88, 'raster-contrast': -0.12, 'raster-brightness-min': 0.12 } },
        ],
      },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    labels.current = REGIONS.map((r) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'region-label';
      el.textContent = r.name;
      el.addEventListener('click', () => onPickRef.current(r.id));
      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([(r.bbox.west + r.bbox.east) / 2, (r.bbox.south + r.bbox.north) / 2])
        .addTo(m);
      return { id: r.id, el };
    });

    m.on('load', () => {
      m.addSource('presets', { type: 'geojson', data: PRESETS });
      m.addLayer({ id: 'presets-line', type: 'line', source: 'presets', paint: { 'line-color': COLORS.ember, 'line-width': 1.5, 'line-dasharray': [3, 2] } });
      m.addSource('aoi', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': COLORS.ink, 'fill-opacity': 0.05 } });
      m.addSource('country', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'country-fill', type: 'fill', source: 'country', paint: { 'fill-color': COLORS.ink, 'fill-opacity': 0.05 } });
      m.addSource('hexes', { type: 'geojson', data: EMPTY });
      // H3 hexagons shaded by fire cell-days inside them (same steps as the legend).
      // Zoomed out a res7 cell (about 2 km) is under a pixel, so each cell is a dot at its centre whose size follows the cell's real
      // size on screen (it doubles with every zoom level, like the hexagon will). Around DOT_ZOOM the dots fade into hexagons.
      m.addSource('dots', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'hexes-dots',
        type: 'circle',
        source: 'dots',
        maxzoom: DOT_ZOOM + 0.6,
        layout: { 'circle-sort-key': ['get', 'value'] },
        paint: {
          'circle-color': hexColorExpression(stepsRef.current) as never,
          'circle-radius': DOT_RADIUS as never,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], DOT_ZOOM - 0.5, 0.9, DOT_ZOOM + 0.2, 0],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], DOT_ZOOM - 0.5, 0.35, DOT_ZOOM + 0.2, 0],
          'circle-stroke-width': 0.5,
        },
      });
      // H3 hexagons shaded by days with fire (same steps as the legend), with a thin light seam so neighbours stay apart.
      m.addLayer({
        id: 'hexes-fill',
        type: 'fill',
        source: 'hexes',
        minzoom: DOT_ZOOM - 0.6,
        paint: {
          'fill-color': hexColorExpression(stepsRef.current) as never,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], DOT_ZOOM - 0.5, 0, DOT_ZOOM + 0.2, 0.9],
        },
      });
      m.addLayer({
        id: 'hexes-line',
        type: 'line',
        source: 'hexes',
        minzoom: DOT_ZOOM - 0.6,
        paint: {
          'line-color': '#ffffff',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], DOT_ZOOM - 0.5, 0, DOT_ZOOM + 0.2, 0.55],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1.2],
        },
      });
      // A translucent veil over everything outside the country, so hexagons that overhang its border fade out.
      m.addSource('mask', { type: 'geojson', data: EMPTY });
      m.addLayer({ id: 'mask-fill', type: 'fill', source: 'mask', paint: { 'fill-color': '#EDF0EC', 'fill-opacity': 0.72 } });
      m.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': COLORS.ink, 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      m.addLayer({ id: 'country-line', type: 'line', source: 'country', paint: { 'line-color': COLORS.ink, 'line-width': 2 } });
      ready.current = true;
      syncArea();
      syncHexes();
      fit();
    });
    const reportView = () => {
      const b = m.getBounds();
      onViewRef.current({ zoom: m.getZoom(), lat: m.getCenter().lat, bounds: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } });
    };
    m.on('load', reportView);
    m.on('moveend', reportView);

    // Click a hexagon to read how many days it had fire.
    const pick = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f || drawingRef.current) return;
      const value = Number(f.properties?.value);
      const n = Number(f.properties?.n);
      const text =
        kindRef.current === 'tempC'
          ? t('hexTemp', { c: value.toFixed(1), n: n > 0 ? String(n) : '1' })
          : value === 1
            ? t('hexOneDay')
            : t('hexDays', { n: value });
      new maplibregl.Popup({ closeButton: false, offset: 4 }).setLngLat(e.lngLat).setText(text).addTo(m);
    };
    for (const id of ['hexes-fill', 'hexes-dots']) m.on('click', id, pick);
    for (const id of ['hexes-fill', 'hexes-dots']) {
      m.on('mouseenter', id, () => !drawingRef.current && (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', id, () => !drawingRef.current && (m.getCanvas().style.cursor = ''));
    }

    // Rectangle drawing (mouse + touch)
    let start: maplibregl.LngLat | null = null;
    const bounds = (a: maplibregl.LngLat, b: maplibregl.LngLat): Bbox => ({
      west: clamp(Math.min(a.lng, b.lng), -180, 180),
      east: clamp(Math.max(a.lng, b.lng), -180, 180),
      south: clamp(Math.min(a.lat, b.lat), -90, 90),
      north: clamp(Math.max(a.lat, b.lat), -90, 90),
    });
    const down = (e: MapMouseEvent | MapTouchEvent) => {
      if (!drawingRef.current) return;
      start = e.lngLat;
    };
    const move = (e: MapMouseEvent | MapTouchEvent) => {
      if (!start) return;
      (m.getSource('aoi') as GeoJSONSource | undefined)?.setData(rect(bounds(start, e.lngLat)));
    };
    const up = (e: MapMouseEvent | MapTouchEvent) => {
      if (!start) return;
      const b = bounds(start, e.lngLat);
      start = null;
      if (b.east - b.west > 0.05 && b.north - b.south > 0.05) onDrawnRef.current(b);
      else syncArea();
    };
    m.on('mousedown', down);
    m.on('mousemove', move);
    m.on('mouseup', up);
    m.on('touchstart', down);
    m.on('touchmove', move);
    m.on('touchend', up);

    return () => {
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready.current) syncArea();
  }, [bbox, outline]);

  useEffect(() => {
    if (ready.current) syncHexes();
  }, [cells, steps, sparse]);

  useEffect(() => {
    if (ready.current) fit();
  }, [fitSignal]);

  useEffect(() => {
    const m = map.current;
    if (!m || !flyTo) return;
    m.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: Math.max(m.getZoom(), 9), duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.n]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (drawing) {
      m.dragPan.disable();
      m.touchZoomRotate.disable();
      m.getCanvas().style.cursor = 'crosshair';
    } else {
      m.dragPan.enable();
      m.touchZoomRotate.enable();
      m.getCanvas().style.cursor = '';
    }
    for (const l of labels.current) l.el.style.pointerEvents = drawing ? 'none' : '';
  }, [drawing]);

  return <div ref={box} style={{ position: 'absolute', inset: 0, background: '#dfe4df' }} role="application" aria-label={t('map')} />;
}
