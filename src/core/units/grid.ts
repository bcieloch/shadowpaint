import type { CanvasSettings, GridSettings } from '@/core/types';

export interface GridLine {
  positionCm: number;
  positionPx: number;
  isMajor: boolean;
  index: number;
  label?: string;
}

export interface GeneratedGridLines {
  vertical: GridLine[];
  horizontal: GridLine[];
  majorSpacingCm: number;
  minorSpacingCm: number;
  subdivisions: number;
}

export interface RulerStep {
  majorCm: number;
  minorDivisions: number;
}

const NICE_RULER_STEPS_CM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200] as const;

export function formatGridCmLabel(cm: number): string {
  const rounded = Math.round(cm * 100) / 100;
  if (Math.abs(rounded) < 1e-6) return '0';
  return Number.isInteger(rounded) ? String(rounded) : String(Number(rounded.toFixed(2)));
}

function generateAxisLines(
  axisCm: number,
  axisPx: number,
  spacingCm: number,
  subdivisions: number,
  includeLabels: boolean,
): GridLine[] {
  if (!Number.isFinite(axisCm) || !Number.isFinite(axisPx) || axisCm <= 0 || axisPx <= 0) {
    return [];
  }

  const safeSpacing = Math.max(0.05, spacingCm);
  const safeSubdivisions = Math.max(1, Math.min(20, Math.round(subdivisions)));
  const minorSpacingCm = safeSpacing / safeSubdivisions;
  const pxPerCm = axisPx / axisCm;
  const maxStep = Math.floor(axisCm / minorSpacingCm + 1e-6);

  const lines: GridLine[] = [];
  for (let step = 0; step <= maxStep; step++) {
    const isMajor = step % safeSubdivisions === 0;
    const rawCm = isMajor ? (step / safeSubdivisions) * safeSpacing : step * minorSpacingCm;
    if (rawCm > axisCm + 1e-5) break;
    const positionCm = Math.min(axisCm, Number(rawCm.toFixed(6)));
    const positionPx = positionCm * pxPerCm;
    const line: GridLine = {
      positionCm,
      positionPx,
      isMajor,
      index: step,
    };
    if (isMajor && includeLabels) {
      line.label = formatGridCmLabel(positionCm);
    }
    lines.push(line);
  }
  return lines;
}

export function generateGridLines(
  canvas: Pick<CanvasSettings, 'widthCm' | 'heightCm' | 'widthPx' | 'heightPx'>,
  grid: Pick<GridSettings, 'spacingCm' | 'subdivisions' | 'labels'>,
): GeneratedGridLines {
  const majorSpacingCm = Math.max(0.05, Number.isFinite(grid.spacingCm) ? grid.spacingCm : 5);
  const subdivisions = Math.max(
    1,
    Math.min(20, Math.round(Number.isFinite(grid.subdivisions) ? grid.subdivisions : 1)),
  );
  const minorSpacingCm = majorSpacingCm / subdivisions;

  return {
    vertical: generateAxisLines(
      canvas.widthCm,
      canvas.widthPx,
      majorSpacingCm,
      subdivisions,
      grid.labels,
    ),
    horizontal: generateAxisLines(
      canvas.heightCm,
      canvas.heightPx,
      majorSpacingCm,
      subdivisions,
      grid.labels,
    ),
    majorSpacingCm,
    minorSpacingCm,
    subdivisions,
  };
}

export function computeRulerStepCm(zoom: number, pxPerCm: number, minLabelSpacingPx = 56): RulerStep {
  const pxPerCmOnScreen = Math.max(1e-4, zoom * pxPerCm);
  const minCm = minLabelSpacingPx / pxPerCmOnScreen;

  let majorCm = 200;
  for (const step of NICE_RULER_STEPS_CM) {
    if (step >= minCm) {
      majorCm = step;
      break;
    }
  }

  const majorScreenPx = majorCm * pxPerCmOnScreen;
  let minorDivisions = 10;
  if (majorScreenPx / 10 < 5) {
    minorDivisions = majorScreenPx / 5 >= 5 ? 5 : majorScreenPx / 2 >= 5 ? 2 : 1;
  }

  return { majorCm, minorDivisions };
}
