const NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const toYm = (year: number, month: number): string | null =>
  year >= 1900 && year <= 2100 && month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, '0')}` : null;

/** 'mar', 'march', 'sept'... -> 1..12, or 0 when the word is not a month (at least three letters, a prefix of the name). */
const monthFromName = (word: string): number => (word.length < 3 ? 0 : NAMES.findIndex((n) => n.startsWith(word)) + 1);

/**
 * Reads a month typed by hand and returns 'YYYY-MM', or null when it is not exactly one month of one year.
 * Accepts 2019-03, 2019/3, 03/2019, 3.2019, 201903, 032019, Mar 2019, march 2019, 2019 mar, sept 2020.
 */
export function parseMonth(input: string): string | null {
  const s = input.trim().toLowerCase().replaceAll(',', ' ').replace(/\s+/g, ' ');
  if (!s) return null;
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^([a-z]+)[\s./-]*(\d{4})$/))) return toYm(Number(m[2]), monthFromName(m[1]));
  if ((m = s.match(/^(\d{4})[\s./-]*([a-z]+)$/))) return toYm(Number(m[1]), monthFromName(m[2]));
  if ((m = s.match(/^(\d{4})[\s./-]+(\d{1,2})$/))) return toYm(Number(m[1]), Number(m[2]));
  if ((m = s.match(/^(\d{1,2})[\s./-]+(\d{4})$/))) return toYm(Number(m[2]), Number(m[1]));
  if (/^\d{6}$/.test(s)) return toYm(Number(s.slice(0, 4)), Number(s.slice(4))) ?? toYm(Number(s.slice(2)), Number(s.slice(0, 2)));
  return null;
}

/** Pull a month into the range the data covers. */
export function clampMonth(ym: string, limits: { min: string; max: string }): string {
  return ym < limits.min ? limits.min : ym > limits.max ? limits.max : ym;
}

const index = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5)) - 1;

/** The month in the list closest to `ym` (the earlier one on a tie), or null for an empty list. */
export function nearestMonth(months: string[], ym: string): string | null {
  const target = index(ym);
  let best: string | null = null;
  let bestDist = Infinity;
  for (const m of months) {
    const d = Math.abs(index(m) - target);
    if (d < bestDist || (d === bestDist && best !== null && m < best)) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

/** Months in a period, both ends included. */
export function monthCount(range: { start: string; end: string }): number {
  return index(range.end) - index(range.start) + 1;
}
