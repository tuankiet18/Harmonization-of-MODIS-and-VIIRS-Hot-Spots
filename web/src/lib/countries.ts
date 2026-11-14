import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Bbox } from '../data/types';
import { mainBbox, type CountryGeometry } from './geo';

export interface Country {
  /** ISO 3166-1 numeric code ('704'), or the name for the few areas without one (Kosovo, Somaliland...). */
  id: string;
  name: string;
  /** Box to fit the map to and to ask the API for (see mainBbox). */
  bbox: Bbox;
  geometry: CountryGeometry;
}

/** Countries from a Natural Earth topology (the `world-atlas` package), sorted by name. */
export function buildCountries(topology: Topology): Country[] {
  const fc = feature(topology, topology.objects.countries as never) as unknown as GeoJSON.FeatureCollection<CountryGeometry, { name: string }>;
  const seen = new Set<string>();
  return fc.features
    .map((f) => {
      // A few areas share a code (Australia and the Ashmore and Cartier Is.): the later one is told apart by its name.
      let id = String(f.id ?? f.properties.name);
      if (seen.has(id)) id = f.properties.name;
      seen.add(id);
      return { id, name: f.properties.name, bbox: mainBbox(f.geometry), geometry: f.geometry };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

let cached: Promise<Country[]> | null = null;

/** Loads the 50m borders (about 750 KB) the first time it is called; the file is split out of the main bundle. */
export function loadCountries(): Promise<Country[]> {
  cached ??= import('world-atlas/countries-50m.json').then((m) => buildCountries(m.default as unknown as Topology));
  return cached;
}
