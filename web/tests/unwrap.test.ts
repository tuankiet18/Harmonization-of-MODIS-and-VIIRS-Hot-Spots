import { describe, expect, it } from 'vitest';
import { unwrapGeometry } from '../src/lib/geo';

describe('unwrapGeometry', () => {
  it('makes a ring that crosses the date line continuous, so it is drawn as one piece', () => {
    const ring = [[170, 65], [179, 66], [-179, 66], [-170, 65], [170, 65]];
    const g = unwrapGeometry({ type: 'Polygon', coordinates: [ring] });
    const xs = (g.coordinates[0] as number[][]).map((c) => c[0]);
    expect(xs.slice(0, 4)).toEqual([170, 179, 181, 190]);
    for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThan(180);
  });
  it('leaves a country that does not cross it as it is', () => {
    const ring = [[102, 8], [110, 8], [110, 23], [102, 23], [102, 8]];
    expect(unwrapGeometry({ type: 'Polygon', coordinates: [ring] }).coordinates[0]).toEqual(ring);
  });
});
