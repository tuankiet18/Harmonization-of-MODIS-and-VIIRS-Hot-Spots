import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { REGIONS, WORLD_VIEW } from '../data/regions';
import { useI18n } from '../i18n';
import { COLORS } from '../lib/theme';
import type { Bbox, HotspotPoint } from '../data/types';

interface Props {
  bbox: Bbox | null;
  /** Increment to make the map fly to the current bbox (not for rectangles drawn on the map). */
  fitSignal: number;
  drawing: boolean;
  onDrawn: (b: Bbox) => void;
  points: HotspotPoint[];
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
const toGeo = (pts: HotspotPoint[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
});
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function MapPanel({ bbox, fitSignal, drawing, onDrawn, points, onPickRegion }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const labels = useRef<{ id: string; el: HTMLButtonElement }[]>([]);
  const bboxRef = useRef(bbox);
  const pointsRef = useRef(points);
  const drawingRef = useRef(drawing);
  const onDrawnRef = useRef(onDrawn);
  const onPickRef = useRef(onPickRegion);
  bboxRef.current = bbox;
  pointsRef.current = points;
  drawingRef.current = drawing;
  onDrawnRef.current = onDrawn;
  onPickRef.current = onPickRegion;

  const syncArea = () => {
    const m = map.current;
    if (!m) return;
    const b = bboxRef.current;
    (m.getSource('aoi') as GeoJSONSource | undefined)?.setData(b ? rect(b) : EMPTY);
    // Preset outlines and their labels are the way in when no area is chosen yet.
    m.setLayoutProperty('presets-line', 'visibility', b ? 'none' : 'visible');
    for (const l of labels.current) l.el.hidden = !!b;
  };
  const syncPoints = () => {
    (map.current?.getSource('hotspots') as GeoJSONSource | undefined)?.setData(toGeo(pointsRef.current));
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
      m.addSource('hotspots', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'hotspots-glow',
        type: 'circle',
        source: 'hotspots',
        paint: {
          'circle-color': '#F29A35',
          'circle-blur': 1,
          'circle-opacity': 0.22,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4, 6, 9, 10, 18],
        },
      });
      m.addLayer({
        id: 'hotspots-dot',
        type: 'circle',
        source: 'hotspots',
        paint: {
          'circle-color': COLORS.ember,
          'circle-opacity': 0.8,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1.2, 6, 2.4, 10, 5],
        },
      });
      m.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': COLORS.ink, 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      ready.current = true;
      syncArea();
      syncPoints();
      fit();
    });

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
  }, [bbox]);

  useEffect(() => {
    if (ready.current) syncPoints();
  }, [points]);

  useEffect(() => {
    if (ready.current) fit();
  }, [fitSignal]);

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
