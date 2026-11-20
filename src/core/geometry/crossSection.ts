import { clamp01 } from '@/core/maps/quantize';
import type { CanvasSettings, LineSegment, Vec2 } from '@/core/types';
import { valueToMm } from '@/core/units/calibration';

export type CrossSectionCalibration = Pick<
  CanvasSettings,
  'widthCm' | 'heightCm' | 'widthPx' | 'heightPx' | 'minThicknessMm' | 'maxThicknessMm'
>;

export interface CrossSectionStats {
  minMm: number;
  maxMm: number;
  meanMm: number;
  minTransmissionPct: number;
  maxTransmissionPct: number;
  meanTransmissionPct: number;
  totalLengthCm: number;
  sampleCount: number;
}

export interface CrossSectionSample {
  t: number;
  distanceCm: number;
  xPx: number;
  yPx: number;
  thicknessMm: number;
  transmissionPct: number;
}

export interface CrossSectionProfile {
  line: LineSegment;
  sampleCount: number;
  totalLengthCm: number;
  minThicknessMm: number;
  maxThicknessMm: number;
  distanceCm: number[];
  thicknessMm: number[];
  transmissionPct: number[];
  positionsPx: Vec2[];
  stats: CrossSectionStats;
}

export function bilinearSampleFloat(
  data: Float32Array,
  width: number,
  height: number,
  xPx: number,
  yPx: number,
): number {
  if (width <= 0 || height <= 0 || data.length === 0) return 0;

  const x = Math.min(width - 1, Math.max(0, xPx));
  const y = Math.min(height - 1, Math.max(0, yPx));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;

  const v00 = data[y0 * width + x0] ?? 0;
  const v10 = data[y0 * width + x1] ?? 0;
  const v01 = data[y1 * width + x0] ?? 0;
  const v11 = data[y1 * width + x1] ?? 0;

  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

export function sampleCrossSection(
  line: LineSegment,
  heightEffective: Float32Array,
  opacityEffective: Float32Array,
  canvas: CrossSectionCalibration,
): CrossSectionProfile {
  const dxPx = line.p1.x - line.p0.x;
  const dyPx = line.p1.y - line.p0.y;
  const lengthPx = Math.hypot(dxPx, dyPx);
  const sampleCount = Math.max(2, Math.ceil(lengthPx));

  const safeWidthCm = Math.max(1e-6, canvas.widthCm);
  const safeHeightCm = Math.max(1e-6, canvas.heightCm);
  const pxPerCmX = canvas.widthPx / safeWidthCm;
  const pxPerCmY = canvas.heightPx / safeHeightCm;
  const totalLengthCm = Math.hypot(dxPx / pxPerCmX, dyPx / pxPerCmY);

  const distanceCm = new Array<number>(sampleCount);
  const thicknessMm = new Array<number>(sampleCount);
  const transmissionPct = new Array<number>(sampleCount);
  const positionsPx = new Array<Vec2>(sampleCount);

  let minMm = Number.POSITIVE_INFINITY;
  let maxMm = Number.NEGATIVE_INFINITY;
  let sumMm = 0;

  let minTransmissionPct = Number.POSITIVE_INFINITY;
  let maxTransmissionPct = Number.NEGATIVE_INFINITY;
  let sumTransmissionPct = 0;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    const xPx = line.p0.x + dxPx * t;
    const yPx = line.p0.y + dyPx * t;

    const hNorm = clamp01(
      bilinearSampleFloat(heightEffective, canvas.widthPx, canvas.heightPx, xPx, yPx),
    );
    const oNorm = clamp01(
      bilinearSampleFloat(opacityEffective, canvas.widthPx, canvas.heightPx, xPx, yPx),
    );

    const mm = valueToMm(hNorm, canvas.minThicknessMm, canvas.maxThicknessMm);
    const tr = oNorm * 100;
    const dCm = t * totalLengthCm;

    distanceCm[i] = dCm;
    thicknessMm[i] = mm;
    transmissionPct[i] = tr;
    positionsPx[i] = { x: xPx, y: yPx };

    if (mm < minMm) minMm = mm;
    if (mm > maxMm) maxMm = mm;
    sumMm += mm;

    if (tr < minTransmissionPct) minTransmissionPct = tr;
    if (tr > maxTransmissionPct) maxTransmissionPct = tr;
    sumTransmissionPct += tr;
  }

  return {
    line: {
      p0: { ...line.p0 },
      p1: { ...line.p1 },
    },
    sampleCount,
    totalLengthCm,
    minThicknessMm: canvas.minThicknessMm,
    maxThicknessMm: canvas.maxThicknessMm,
    distanceCm,
    thicknessMm,
    transmissionPct,
    positionsPx,
    stats: {
      minMm: Number.isFinite(minMm) ? minMm : canvas.minThicknessMm,
      maxMm: Number.isFinite(maxMm) ? maxMm : canvas.minThicknessMm,
      meanMm: sumMm / sampleCount,
      minTransmissionPct: Number.isFinite(minTransmissionPct) ? minTransmissionPct : 0,
      maxTransmissionPct: Number.isFinite(maxTransmissionPct) ? maxTransmissionPct : 0,
      meanTransmissionPct: sumTransmissionPct / sampleCount,
      totalLengthCm,
      sampleCount,
    },
  };
}

export function interpolateCrossSectionSample(
  profile: CrossSectionProfile,
  tInput: number,
): CrossSectionSample {
  const t = clamp01(tInput);
  const count = profile.sampleCount;
  if (count <= 0) {
    return {
      t: 0,
      distanceCm: 0,
      xPx: profile.line.p0.x,
      yPx: profile.line.p0.y,
      thicknessMm: profile.minThicknessMm,
      transmissionPct: 0,
    };
  }
  if (count === 1) {
    const pos = profile.positionsPx[0] ?? profile.line.p0;
    return {
      t: 0,
      distanceCm: profile.distanceCm[0] ?? 0,
      xPx: pos.x,
      yPx: pos.y,
      thicknessMm: profile.thicknessMm[0] ?? profile.minThicknessMm,
      transmissionPct: profile.transmissionPct[0] ?? 0,
    };
  }

  const posF = t * (count - 1);
  const i0 = Math.floor(posF);
  const i1 = Math.min(count - 1, i0 + 1);
  const f = posF - i0;

  const d0 = profile.distanceCm[i0] ?? 0;
  const d1 = profile.distanceCm[i1] ?? d0;
  const m0 = profile.thicknessMm[i0] ?? profile.minThicknessMm;
  const m1 = profile.thicknessMm[i1] ?? m0;
  const tr0 = profile.transmissionPct[i0] ?? 0;
  const tr1 = profile.transmissionPct[i1] ?? tr0;
  const p0 = profile.positionsPx[i0] ?? profile.line.p0;
  const p1 = profile.positionsPx[i1] ?? p0;

  return {
    t,
    distanceCm: d0 + (d1 - d0) * f,
    xPx: p0.x + (p1.x - p0.x) * f,
    yPx: p0.y + (p1.y - p0.y) * f,
    thicknessMm: m0 + (m1 - m0) * f,
    transmissionPct: tr0 + (tr1 - tr0) * f,
  };
}

export function crossSectionToCsv(profile: CrossSectionProfile): string {
  const lines = ['distance_cm,thickness_mm,transmission_pct'];
  for (let i = 0; i < profile.sampleCount; i++) {
    const d = (profile.distanceCm[i] ?? 0).toFixed(4);
    const mm = (profile.thicknessMm[i] ?? 0).toFixed(4);
    const tr = (profile.transmissionPct[i] ?? 0).toFixed(2);
    lines.push(`${d},${mm},${tr}`);
  }
  return `${lines.join('\n')}\n`;
}
