import type { Bbox } from './types';

export interface Region {
  id: string;
  name: { en: string; vi: string };
  /** English name as used mid-sentence, when it needs an article. */
  enInSentence?: string;
  bbox: Bbox;
  /** Peak fire month (1-12) used only by the mock generator. */
  peakMonth: number;
  /** Relative fire intensity used only by the mock generator. */
  intensity: number;
}

export const REGIONS: Region[] = [
  { id: 'amazon', name: { en: 'Amazon Basin', vi: 'Lưu vực Amazon' }, enInSentence: 'the Amazon Basin', bbox: { west: -66, south: -14, east: -52, north: -4 }, peakMonth: 9, intensity: 1.0 },
  { id: 'california', name: { en: 'California', vi: 'California' }, bbox: { west: -124, south: 32.5, east: -114, north: 42 }, peakMonth: 8, intensity: 0.45 },
  { id: 'se-australia', name: { en: 'Southeast Australia', vi: 'Đông Nam Úc' }, bbox: { west: 144, south: -39, east: 154, north: -28 }, peakMonth: 1, intensity: 0.5 },
  { id: 'siberia', name: { en: 'Siberia', vi: 'Siberia' }, bbox: { west: 100, south: 56, east: 120, north: 64 }, peakMonth: 7, intensity: 0.7 },
  { id: 'central-africa', name: { en: 'Central Africa', vi: 'Trung Phi' }, bbox: { west: 14, south: -12, east: 28, north: -2 }, peakMonth: 7, intensity: 1.3 },
  { id: 'sea', name: { en: 'Mainland Southeast Asia', vi: 'Đông Nam Á lục địa' }, bbox: { west: 98, south: 12, east: 108, north: 22 }, peakMonth: 3, intensity: 0.9 },
];

export const WORLD_VIEW = { center: [20, 15] as [number, number], zoom: 1.4 };
