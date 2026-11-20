import { clamp01 } from '@/core/maps/quantize';

export interface Rgb01 {
  r: number;
  g: number;
  b: number;
}

/**
 * Polynomial approximation of Google's Turbo colormap (Mikhailov, 2019).
 * Matches `turboColormap` in `engine3d/shaders/colormaps.glsl`.
 */
export function sampleTurboRgb01(tRaw: number): Rgb01 {
  const x = clamp01(tRaw);
  const x2 = x * x;
  const x3 = x2 * x;
  const x4 = x3 * x;
  const x5 = x4 * x;

  const r =
    0.13572138 +
    4.6153926 * x -
    42.66032258 * x2 +
    132.13108234 * x3 -
    152.94239396 * x4 +
    59.28637943 * x5;
  const g =
    0.09140261 +
    2.19418839 * x +
    4.84296658 * x2 -
    14.18503333 * x3 +
    4.27729857 * x4 +
    2.82956604 * x5;
  const b =
    0.1066733 +
    12.64194608 * x -
    60.58204836 * x2 +
    110.36276771 * x3 -
    89.90310912 * x4 +
    27.34824973 * x5;

  return {
    r: clamp01(r),
    g: clamp01(g),
    b: clamp01(b),
  };
}

const TOPO_STOPS: readonly [number, Rgb01][] = [
  [0.0, { r: 0.08, g: 0.19, b: 0.36 }],
  [0.2, { r: 0.13, g: 0.45, b: 0.52 }],
  [0.45, { r: 0.32, g: 0.68, b: 0.42 }],
  [0.68, { r: 0.85, g: 0.78, b: 0.42 }],
  [0.86, { r: 0.76, g: 0.41, b: 0.24 }],
  [1.0, { r: 0.96, g: 0.95, b: 0.94 }],
];

/**
 * Hypsometric relief palette matching `topoColormap` in `engine3d/shaders/colormaps.glsl`.
 */
export function sampleTopoRgb01(tRaw: number): Rgb01 {
  const t = clamp01(tRaw);
  for (let i = 0; i < TOPO_STOPS.length - 1; i++) {
    const a = TOPO_STOPS[i];
    const b = TOPO_STOPS[i + 1];
    if (!a || !b) continue;
    if (t <= b[0]) {
      const span = Math.max(1e-6, b[0] - a[0]);
      const f = (t - a[0]) / span;
      return {
        r: a[1].r + (b[1].r - a[1].r) * f,
        g: a[1].g + (b[1].g - a[1].g) * f,
        b: a[1].b + (b[1].b - a[1].b) * f,
      };
    }
  }
  const last = TOPO_STOPS[TOPO_STOPS.length - 1];
  return last ? last[1] : { r: 1, g: 1, b: 1 };
}

export function rgb01ToCss(rgb: Rgb01): string {
  const r = Math.round(clamp01(rgb.r) * 255);
  const g = Math.round(clamp01(rgb.g) * 255);
  const b = Math.round(clamp01(rgb.b) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function buildHeightCssGradient(
  mode: 'gray' | 'heat' | 'topo',
  direction: 'to top' | 'to right' = 'to right',
  stops = 16,
): string {
  const parts: string[] = [];
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    const pct = `${(t * 100).toFixed(1)}%`;
    let cssColor: string;
    if (mode === 'gray') {
      cssColor = rgb01ToCss({ r: t, g: t, b: t });
    } else if (mode === 'heat') {
      cssColor = rgb01ToCss(sampleTurboRgb01(t));
    } else {
      cssColor = rgb01ToCss(sampleTopoRgb01(t));
    }
    parts.push(`${cssColor} ${pct}`);
  }
  return `linear-gradient(${direction}, ${parts.join(', ')})`;
}

export function computeNiceScaleTicks(min: number, max: number, targetCount = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const span = max - min;
  const rawStep = span / Math.max(2, targetCount - 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const fraction = rawStep / pow10;
  let niceFraction: number;
  if (fraction <= 1.2) niceFraction = 1;
  else if (fraction <= 2.2) niceFraction = 2;
  else if (fraction <= 5.5) niceFraction = 5;
  else niceFraction = 10;

  const step = niceFraction * pow10;
  const ticks: number[] = [min];
  const firstInner = Math.ceil((min + step * 0.25) / step) * step;
  for (let v = firstInner; v < max - step * 0.25; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  ticks.push(max);
  return ticks;
}
