import type { LineSegment, Vec2 } from '@/core/types';

export interface RulerCalibration {
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
}

export interface RulerMeasurement {
  p0Px: Vec2;
  p1Px: Vec2;
  p0Cm: Vec2;
  p1Cm: Vec2;
  dxPx: number;
  dyPx: number;
  lengthPx: number;
  dxCm: number;
  dyCm: number;
  lengthCm: number;
  lengthMm: number;
  /** Signed mathematical angle in degrees (-180..180], where +X is 0° and -Y (up on canvas) is +90°. */
  angleDeg: number;
}

export function snapSegment15Deg(p0: Vec2, p1: Vec2): Vec2 {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: p1.x, y: p1.y };
  const step = Math.PI / 12; // 15 deg
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: p0.x + Math.cos(angle) * len,
    y: p0.y + Math.sin(angle) * len,
  };
}

export function measureRulerLine(
  line: LineSegment,
  calibration: RulerCalibration,
): RulerMeasurement {
  const safeWidthCm = Math.max(1e-6, calibration.widthCm);
  const safeHeightCm = Math.max(1e-6, calibration.heightCm);
  const pxPerCmX = calibration.widthPx / safeWidthCm;
  const pxPerCmY = calibration.heightPx / safeHeightCm;

  const p0Cm: Vec2 = {
    x: line.p0.x / pxPerCmX,
    y: line.p0.y / pxPerCmY,
  };
  const p1Cm: Vec2 = {
    x: line.p1.x / pxPerCmX,
    y: line.p1.y / pxPerCmY,
  };

  const dxPx = line.p1.x - line.p0.x;
  const dyPx = line.p1.y - line.p0.y;
  const lengthPx = Math.hypot(dxPx, dyPx);

  const dxCm = p1Cm.x - p0Cm.x;
  const dyCm = p1Cm.y - p0Cm.y;
  const lengthCm = Math.hypot(dxCm, dyCm);
  const lengthMm = lengthCm * 10;

  let angleDeg = 0;
  if (lengthCm > 1e-9) {
    angleDeg = (Math.atan2(-dyCm, dxCm) * 180) / Math.PI;
    if (Object.is(angleDeg, -0) || Math.abs(angleDeg) < 1e-9) {
      angleDeg = 0;
    }
  }

  return {
    p0Px: { ...line.p0 },
    p1Px: { ...line.p1 },
    p0Cm,
    p1Cm,
    dxPx,
    dyPx,
    lengthPx,
    dxCm,
    dyCm,
    lengthCm,
    lengthMm,
    angleDeg,
  };
}
