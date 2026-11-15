/**
 * Writes deploy/country_boxes.json: for every country the web app can ask for by name in the data, the exact box the app sends, so that
 * deploy/warm_cache.py can fill the server's cache with the very URLs the browsers will ask for.
 *
 *   cd web && npx vite-node scripts/export-country-boxes.ts
 */
import { writeFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import topology from 'world-atlas/countries-50m.json';
import { COUNTRY_DATA_NAMES } from '../src/data/countryDataNames';
import { buildCountries } from '../src/lib/countries';

const out = buildCountries(topology as unknown as Topology)
  .filter((c) => COUNTRY_DATA_NAMES[c.id])
  .map((c) => ({ name: COUNTRY_DATA_NAMES[c.id], label: c.name, bbox: c.bbox }));
writeFileSync(new URL('../../deploy/country_boxes.json', import.meta.url), JSON.stringify(out, null, 0) + '\n');
console.log(`${out.length} countries written`);
