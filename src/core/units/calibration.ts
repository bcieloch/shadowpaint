import {
  ASPECT_RATIO_TOLERANCE,
  CM_PER_INCH,
  MAX_CANVAS_CM,
  MAX_PROJECT_PX,
  MAX_THICKNESS_MM,
  MIN_CANVAS_CM,
  MIN_PROJECT_PX,
  MIN_THICKNESS_MM,
  MM_PER_CM,
} from '@/core/constants';
import { clamp01 } from '@/core/maps/quantize';
import type { CanvasSettings, Vec2 } from '@/core/types';

export interface CalibrationMetrics {
  pxPerCmX: number;
  pxPerCmY: number;
  pxPerCm: number;
  dpi: number;
  aspectDeviation: number;
  isAspectConsistent: boolean;
}

export function getCalibrationMetrics(canvas: CanvasSettings): CalibrationMetrics {
  const pxPerCmX = canvas.widthPx / canvas.widthCm;
  const pxPerCmY = canvas.heightPx / canvas.heightCm;
  const aspectDeviation = Math.abs(pxPerCmX - pxPerCmY) / pxPerCmX;
  return {
    pxPerCmX,
    pxPerCmY,
    pxPerCm: pxPerCmX,
    dpi: pxPerCmX * CM_PER_INCH,
    aspectDeviation,
    isAspectConsistent: aspectDeviation <= ASPECT_RATIO_TOLERANCE,
  };
}

export function pxToCm(xPx: number, yPx: number, canvas: CanvasSettings): Vec2 {
  const pxPerCmX = canvas.widthPx / canvas.widthCm;
  const pxPerCmY = canvas.heightPx / canvas.heightCm;
  return {
    x: xPx / pxPerCmX,
    y: yPx / pxPerCmY,
  };
}

export function cmToPx(xCm: number, yCm: number, canvas: CanvasSettings): Vec2 {
  const pxPerCmX = canvas.widthPx / canvas.widthCm;
  const pxPerCmY = canvas.heightPx / canvas.heightCm;
  return {
    x: xCm * pxPerCmX,
    y: yCm * pxPerCmY,
  };
}

export function cmToWorldXY(xCm: number, yCm: number, canvas: CanvasSettings): Vec2 {
  return {
    x: xCm - canvas.widthCm / 2,
    y: canvas.heightCm / 2 - yCm,
  };
}

export function worldXYToCm(worldX: number, worldY: number, canvas: CanvasSettings): Vec2 {
  return {
    x: worldX + canvas.widthCm / 2,
    y: canvas.heightCm / 2 - worldY,
  };
}

export function pxToWorldXY(xPx: number, yPx: number, canvas: CanvasSettings): Vec2 {
  const cm = pxToCm(xPx, yPx, canvas);
  return cmToWorldXY(cm.x, cm.y, canvas);
}

export function worldXYToPx(worldX: number, worldY: number, canvas: CanvasSettings): Vec2 {
  const cm = worldXYToCm(worldX, worldY, canvas);
  return cmToPx(cm.x, cm.y, canvas);
}

export function valueToMm(normalized: number, minMm: number, maxMm: number): number {
  const v = clamp01(normalized);
  return minMm + v * (maxMm - minMm);
}

export function mmToValue(mm: number, minMm: number, maxMm: number): number {
  const span = maxMm - minMm;
  if (span <= 0) return 0;
  return clamp01((mm - minMm) / span);
}

export function level8ToMm(level: number, minMm: number, maxMm: number): number {
  const clamped = Math.max(0, Math.min(255, Math.round(level)));
  return minMm + (clamped / 255) * (maxMm - minMm);
}

export function mmToLevel8(mm: number, minMm: number, maxMm: number): number {
  return Math.round(mmToValue(mm, minMm, maxMm) * 255);
}

export function valueToWorldZCm(
  normalized: number,
  minMm: number,
  maxMm: number,
  reliefMultiplier = 1,
): number {
  return (valueToMm(normalized, minMm, maxMm) / MM_PER_CM) * reliefMultiplier;
}

export function brushSizeToPx(value: number, unit: 'px' | 'cm', pxPerCm: number): number {
  return unit === 'cm' ? value * pxPerCm : value;
}

export function computeHeightFromWidthPx(widthPx: number, widthCm: number, heightCm: number): number {
  if (widthCm <= 0) return MIN_PROJECT_PX;
  return Math.max(MIN_PROJECT_PX, Math.round((widthPx * heightCm) / widthCm));
}

export function computeWidthFromHeightPx(heightPx: number, widthCm: number, heightCm: number): number {
  if (heightCm <= 0) return MIN_PROJECT_PX;
  return Math.max(MIN_PROJECT_PX, Math.round((heightPx * widthCm) / heightCm));
}

export type CanvasValidationError =
  | 'invalidWidthCm'
  | 'invalidHeightCm'
  | 'invalidWidthPx'
  | 'invalidHeightPx'
  | 'invalidThicknessRange'
  | 'aspectMismatch';

export function validateCanvasSettings(
  canvas: CanvasSettings,
  maxTextureSize = MAX_PROJECT_PX,
): CanvasValidationError[] {
  const errors: CanvasValidationError[] = [];
  const maxPx = Math.min(maxTextureSize, MAX_PROJECT_PX);

  if (!Number.isFinite(canvas.widthCm) || canvas.widthCm < MIN_CANVAS_CM || canvas.widthCm > MAX_CANVAS_CM) {
    errors.push('invalidWidthCm');
  }
  if (!Number.isFinite(canvas.heightCm) || canvas.heightCm < MIN_CANVAS_CM || canvas.heightCm > MAX_CANVAS_CM) {
    errors.push('invalidHeightCm');
  }
  if (
    !Number.isInteger(canvas.widthPx) ||
    canvas.widthPx < MIN_PROJECT_PX ||
    canvas.widthPx > maxPx
  ) {
    errors.push('invalidWidthPx');
  }
  if (
    !Number.isInteger(canvas.heightPx) ||
    canvas.heightPx < MIN_PROJECT_PX ||
    canvas.heightPx > maxPx
  ) {
    errors.push('invalidHeightPx');
  }
  if (
    !Number.isFinite(canvas.minThicknessMm) ||
    !Number.isFinite(canvas.maxThicknessMm) ||
    canvas.minThicknessMm < MIN_THICKNESS_MM ||
    canvas.maxThicknessMm > MAX_THICKNESS_MM ||
    canvas.minThicknessMm >= canvas.maxThicknessMm
  ) {
    errors.push('invalidThicknessRange');
  }

  if (
    canvas.widthCm > 0 &&
    canvas.heightCm > 0 &&
    canvas.widthPx > 0 &&
    canvas.heightPx > 0
  ) {
    const metrics = getCalibrationMetrics(canvas);
    if (!metrics.isAspectConsistent) {
      errors.push('aspectMismatch');
    }
  }

  return errors;
}
