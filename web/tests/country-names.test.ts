import { describe, expect, it } from 'vitest';
import { COUNTRY_DATA_NAMES } from '../src/data/countryDataNames';
import { cutCellsCsv } from '../src/lib/csv';

describe('COUNTRY_DATA_NAMES', () => {
  it('knows the big countries by the name the data uses', () => {
    expect(COUNTRY_DATA_NAMES['704']).toBe('Vietnam');
    expect(COUNTRY_DATA_NAMES['643']).toBe('Russian_Federation');
    expect(COUNTRY_DATA_NAMES['840']).toBe('United_States');
    expect(COUNTRY_DATA_NAMES['036']).toBe('Australia');
  });
  it('has no two countries on one data name', () => {
    const names = Object.values(COUNTRY_DATA_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('cutCellsCsv', () => {
  const square = { type: 'Polygon' as const, coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
  const csv = ['# FireCalendar export', 'date,h3,lat,lon,hottest_bright_mir_c,frp_mw,observations', '2023-03-01,aa,5,5,60,1,1', '2023-03-01,bb,15,5,70,1,1', ''].join('\n');
  it('keeps the cells inside the borders and says so in the header', () => {
    const out = cutCellsCsv(csv, square, 'Squareland').trim().split('\n');
    expect(out).toEqual(['# FireCalendar export', '# aoi_country: Squareland (cells with their centre inside its borders)', 'date,h3,lat,lon,hottest_bright_mir_c,frp_mw,observations', '2023-03-01,aa,5,5,60,1,1']);
  });
});
