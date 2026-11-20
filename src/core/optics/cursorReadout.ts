import { clamp01 } from '@/core/maps/quantize';
import {
  computeBeerLambertTransmission,
  srgbBytesToLinearRgb,
  transmissionLuminance,
} from '@/core/optics/beerLambert';
import type { BackLightSettings, CanvasSettings, MaterialSettings } from '@/core/types';
import { level8ToMm, mmToLevel8, pxToCm, valueToMm } from '@/core/units/calibration';

export interface CursorReadout {
  xPx: number;
  yPx: number;
  xCm: number;
  yCm: number;
  r: number;
  g: number;
  b: number;
  hex: string;
  heightNorm: number;
  heightMm: number;
  level8: number;
  heightMmQuantized: number;
  opacityTau: number;
  opacityPct: number;
  backTransmissionPct: number;
}

export interface SampleCursorReadoutParams {
  imageX: number;
  imageY: number;
  width: number;
  height: number;
  colorEffective: Uint8ClampedArray;
  heightEffective: Float32Array;
  opacityEffective: Float32Array;
  canvas: CanvasSettings;
  material: Pick<MaterialSettings, 'muA' | 'muS' | 'kTint' | 'canvasTransmittance'>;
  back: Pick<BackLightSettings, 'globalTransmissionPct' | 'attenuation'>;
}

function byteToUpperHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .toUpperCase()
    .padStart(2, '0');
}

export function sampleCursorReadout(params: SampleCursorReadoutParams): CursorReadout | null {
  const {
    imageX,
    imageY,
    width,
    height,
    colorEffective,
    heightEffective,
    opacityEffective,
    canvas,
    material,
    back,
  } = params;

  if (
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(imageX) ||
    !Number.isFinite(imageY) ||
    imageX < 0 ||
    imageY < 0 ||
    imageX >= width ||
    imageY >= height
  ) {
    return null;
  }

  const xPx = Math.min(width - 1, Math.max(0, Math.floor(imageX)));
  const yPx = Math.min(height - 1, Math.max(0, Math.floor(imageY)));
  const idx = yPx * width + xPx;
  const rgbaIdx = idx * 4;

  const r = colorEffective[rgbaIdx] ?? 0;
  const g = colorEffective[rgbaIdx + 1] ?? 0;
  const b = colorEffective[rgbaIdx + 2] ?? 0;
  const hex = `#${byteToUpperHex(r)}${byteToUpperHex(g)}${byteToUpperHex(b)}`;

  const heightNorm = clamp01(heightEffective[idx] ?? 0);
  const heightMm = valueToMm(heightNorm, canvas.minThicknessMm, canvas.maxThicknessMm);
  const level8 = mmToLevel8(heightMm, canvas.minThicknessMm, canvas.maxThicknessMm);
  const heightMmQuantized = level8ToMm(level8, canvas.minThicknessMm, canvas.maxThicknessMm);

  const opacityTau = clamp01(opacityEffective[idx] ?? 1);
  const opacityPct = opacityTau * 100;

  const transmission = computeBeerLambertTransmission({
    heightNorm,
    opacityTau,
    colorLinear: srgbBytesToLinearRgb(r, g, b),
    canvas,
    material,
    globalTransmissionPct: back.globalTransmissionPct,
    attenuation: back.attenuation,
  });
  const backTransmissionPct = transmissionLuminance(transmission.total) * 100;

  const cm = pxToCm(xPx, yPx, canvas);

  return {
    xPx,
    yPx,
    xCm: cm.x,
    yCm: cm.y,
    r,
    g,
    b,
    hex,
    heightNorm,
    heightMm,
    level8,
    heightMmQuantized,
    opacityTau,
    opacityPct,
    backTransmissionPct,
  };
}
