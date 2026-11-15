import { describe, expect, it } from 'vitest';
import { clampMonth, nearestMonth, parseMonth } from '../src/lib/months';

describe('parseMonth', () => {
  it('reads year-first forms', () => {
    for (const s of ['2019-03', '2019/03', '2019.3', '2019 03', '2019-3', '201903', ' 2019-03 ']) expect(parseMonth(s), s).toBe('2019-03');
  });
  it('reads month-first forms', () => {
    for (const s of ['03/2019', '3/2019', '03-2019', '3.2019', '032019']) expect(parseMonth(s), s).toBe('2019-03');
  });
  it('reads month names, short or long, either order, any case', () => {
    for (const s of ['Mar 2019', 'march 2019', 'MAR-2019', '2019 mar', 'March, 2019', 'mar2019']) expect(parseMonth(s), s).toBe('2019-03');
    expect(parseMonth('sept 2020')).toBe('2020-09');
    expect(parseMonth('Sep 2020')).toBe('2020-09');
  });
  it('rejects anything that is not exactly one month of one year', () => {
    for (const s of ['', 'hello', '2019', '13/2019', '2019-13', '2019-00', '0/2019', '3/19', 'mar', 'mar 20', '2019-03-05', '1/2/2019', 'foo 2019']) {
      expect(parseMonth(s), s).toBeNull();
    }
  });
  it('rejects years that cannot be real', () => {
    expect(parseMonth('1/1800')).toBeNull();
    expect(parseMonth('1/2200')).toBeNull();
  });
});

describe('clampMonth', () => {
  const limits = { min: '2000-11', max: '2026-10' };
  it('keeps months inside the limits and pulls the others to the nearest end', () => {
    expect(clampMonth('2010-05', limits)).toBe('2010-05');
    expect(clampMonth('1999-01', limits)).toBe('2000-11');
    expect(clampMonth('2030-12', limits)).toBe('2026-10');
  });
});

describe('nearestMonth', () => {
  const months = ['2020-01', '2020-02', '2020-06', '2021-01'];
  it('returns the month itself when it is in the list', () => {
    expect(nearestMonth(months, '2020-06')).toBe('2020-06');
  });
  it('snaps to the closest month in the list', () => {
    expect(nearestMonth(months, '2020-03')).toBe('2020-02');
    expect(nearestMonth(months, '2020-05')).toBe('2020-06');
    expect(nearestMonth(months, '2019-01')).toBe('2020-01');
    expect(nearestMonth(months, '2030-01')).toBe('2021-01');
  });
  it('prefers the earlier month on a tie, and gives null for an empty list', () => {
    expect(nearestMonth(['2020-01', '2020-03'], '2020-02')).toBe('2020-01');
    expect(nearestMonth([], '2020-02')).toBeNull();
  });
});

import { monthCount } from '../src/lib/months';

describe('monthCount', () => {
  it('counts the months of a period, both ends included', () => {
    expect(monthCount({ start: '2014-10', end: '2014-12' })).toBe(3);
    expect(monthCount({ start: '2014-12', end: '2014-12' })).toBe(1);
    expect(monthCount({ start: '2013-11', end: '2014-02' })).toBe(4);
    expect(monthCount({ start: '2000-11', end: '2014-12' })).toBe(170);
  });
});
