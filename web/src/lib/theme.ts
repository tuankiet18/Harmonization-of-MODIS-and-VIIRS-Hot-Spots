/** Mirrors the CSS custom properties in styles.css (charts and the map cannot read CSS variables). */
export const COLORS = {
  page: '#EDF0EC',
  surface: '#FFFFFF',
  ink: '#17221D',
  muted: '#55625B',
  line: '#D3D9D3',
  ember: '#C8400A',
  modis: '#1F5FA8',
  viirs: '#0B7A6B',
};

/**
 * Sequential "burn" ramp for counts: pale ash to charred red. Lightness falls steadily,
 * so it stays readable for colour-blind users and in greyscale print.
 */
export const BURN = ['#F3F1E7', '#FBE6AE', '#F8C566', '#F29A35', '#E0621B', '#BC380D', '#871D0B', '#4B0E0A'];

/** Diverging blue / neutral / orange-brown for anomalies, with numeric breaks (% vs median). */
export const ANOMALY_PIECES = [
  { max: -50, color: '#2B6CB0', label: '≤ −50%' },
  { min: -50, max: -10, color: '#9CC3E6', label: '−50 to −10%' },
  { min: -10, max: 10, color: '#DFE3DF', label: '±10%' },
  { min: 10, max: 50, color: '#F6CF9A', label: '+10 to +50%' },
  { min: 50, max: 100, color: '#EE9A3E', label: '+50 to +100%' },
  { min: 100, max: 200, color: '#D0640F', label: '+100 to +200%' },
  { min: 200, color: '#8F3A07', label: '> +200%' },
];
