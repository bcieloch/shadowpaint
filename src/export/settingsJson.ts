import { clamp01 } from '@/core/maps/quantize';
import { colorSpecToLinearRgb } from '@/core/optics/beerLambert';
import type { ProjectSettings } from '@/core/types';
import { getCalibrationMetrics, valueToMm } from '@/core/units/calibration';
import { backLightToWorld, frontLightToPolar, frontLightToWorld } from '@/core/units/lighting';

export interface ProjectMapStats {
  height: {
    minMm: number;
    maxMm: number;
    meanMm: number;
  };
  opacity: {
    minPct: number;
    maxPct: number;
    meanPct: number;
  };
}

export interface ExportSettingsJson {
  format: 'shadowpaint-settings';
  schemaVersion: 1;
  project: ProjectSettings;
  derived: {
    pxPerCm: number;
    pxPerCmX: number;
    pxPerCmY: number;
    dpi: number;
    aspectRatio: string;
    canvasAreaCm2: number;
    thicknessRangeMm: [number, number];
    mmPerLevel8: number;
    frontLight: {
      positionWorldCm: [number, number, number];
      incidenceAngleDeg: number;
      elevationDeg: number;
      azimuthDeg: number;
      distanceToTargetCm: number;
      rgbLinear: [number, number, number];
    };
    backLight: {
      positionWorldCm: [number, number, number];
      rgbLinear: [number, number, number];
    };
  };
  maps: {
    'color_map.png': {
      width: number;
      height: number;
      colorType: 2 | 6;
      bitDepth: 8;
      meaning: string;
    };
    'height_map.png': {
      width: number;
      height: number;
      colorType: 0;
      bitDepth: 8;
      meaning: string;
    };
    'opacity_map.png': {
      width: number;
      height: number;
      colorType: 0;
      bitDepth: 8;
      meaning: string;
    };
  };
  stats: ProjectMapStats;
  exportedAt: string;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function formatAspectRatio(widthCm: number, heightCm: number): string {
  const a = Math.round(widthCm * 100);
  const b = Math.round(heightCm * 100);
  if (a <= 0 || b <= 0) return '1:1';
  const g = gcd(a, b);
  return `${a / g}:${b / g}`;
}

export function computeProjectMapStats(
  heightEffective: Float32Array,
  opacityEffective: Float32Array,
  minMm: number,
  maxMm: number,
): ProjectMapStats {
  const nH = heightEffective.length;
  let minH = Infinity;
  let maxH = -Infinity;
  let sumH = 0;

  for (let i = 0; i < nH; i++) {
    const mm = valueToMm(heightEffective[i] ?? 0, minMm, maxMm);
    if (mm < minH) minH = mm;
    if (mm > maxH) maxH = mm;
    sumH += mm;
  }

  const nO = opacityEffective.length;
  let minO = Infinity;
  let maxO = -Infinity;
  let sumO = 0;

  for (let i = 0; i < nO; i++) {
    const pct = clamp01(opacityEffective[i] ?? 1) * 100;
    if (pct < minO) minO = pct;
    if (pct > maxO) maxO = pct;
    sumO += pct;
  }

  return {
    height: {
      minMm: nH > 0 ? Number(minH.toFixed(4)) : minMm,
      maxMm: nH > 0 ? Number(maxH.toFixed(4)) : minMm,
      meanMm: nH > 0 ? Number((sumH / nH).toFixed(4)) : minMm,
    },
    opacity: {
      minPct: nO > 0 ? Number(minO.toFixed(2)) : 100,
      maxPct: nO > 0 ? Number(maxO.toFixed(2)) : 100,
      meanPct: nO > 0 ? Number((sumO / nO).toFixed(2)) : 100,
    },
  };
}

export function buildExportSettingsJson(params: {
  project: ProjectSettings;
  heightEffective: Float32Array;
  opacityEffective: Float32Array;
  exportedAt?: string;
}): ExportSettingsJson {
  const { project, heightEffective, opacityEffective } = params;
  const { canvas, lighting, export: exportCfg } = project;
  const metrics = getCalibrationMetrics(canvas);

  const frontWorld = frontLightToWorld(lighting.front, canvas);
  const frontPolar = frontLightToPolar(lighting.front, canvas);
  const frontRgbLin = colorSpecToLinearRgb(lighting.front.color);

  const backWorld = backLightToWorld(lighting.back, canvas);
  const backRgbLin = colorSpecToLinearRgb(lighting.back.color);

  const stats = computeProjectMapStats(
    heightEffective,
    opacityEffective,
    canvas.minThicknessMm,
    canvas.maxThicknessMm,
  );

  return {
    format: 'shadowpaint-settings',
    schemaVersion: 1,
    project: structuredClone(project),
    derived: {
      pxPerCm: Number(metrics.pxPerCm.toFixed(4)),
      pxPerCmX: Number(metrics.pxPerCmX.toFixed(4)),
      pxPerCmY: Number(metrics.pxPerCmY.toFixed(4)),
      dpi: Number(metrics.dpi.toFixed(2)),
      aspectRatio: formatAspectRatio(canvas.widthCm, canvas.heightCm),
      canvasAreaCm2: Number((canvas.widthCm * canvas.heightCm).toFixed(2)),
      thicknessRangeMm: [canvas.minThicknessMm, canvas.maxThicknessMm],
      mmPerLevel8: Number(((canvas.maxThicknessMm - canvas.minThicknessMm) / 255).toFixed(7)),
      frontLight: {
        positionWorldCm: [
          Number(frontWorld.position.x.toFixed(3)),
          Number(frontWorld.position.y.toFixed(3)),
          Number(frontWorld.position.z.toFixed(3)),
        ],
        incidenceAngleDeg: Number(frontPolar.incidenceDeg.toFixed(2)),
        elevationDeg: Number((90 - frontPolar.incidenceDeg).toFixed(2)),
        azimuthDeg: Number(frontPolar.azimuthDeg.toFixed(2)),
        distanceToTargetCm: Number(frontPolar.distanceToTargetCm.toFixed(3)),
        rgbLinear: [
          Number(frontRgbLin.r.toFixed(5)),
          Number(frontRgbLin.g.toFixed(5)),
          Number(frontRgbLin.b.toFixed(5)),
        ],
      },
      backLight: {
        positionWorldCm: [
          Number(backWorld.position.x.toFixed(3)),
          Number(backWorld.position.y.toFixed(3)),
          Number(backWorld.position.z.toFixed(3)),
        ],
        rgbLinear: [
          Number(backRgbLin.r.toFixed(5)),
          Number(backRgbLin.g.toFixed(5)),
          Number(backRgbLin.b.toFixed(5)),
        ],
      },
    },
    maps: {
      'color_map.png': {
        width: canvas.widthPx,
        height: canvas.heightPx,
        colorType: exportCfg.colorPngAlpha ? 6 : 2,
        bitDepth: 8,
        meaning: 'sRGB paint color',
      },
      'height_map.png': {
        width: canvas.widthPx,
        height: canvas.heightPx,
        colorType: 0,
        bitDepth: 8,
        meaning: '0 = minThicknessMm, 255 = maxThicknessMm, linear',
      },
      'opacity_map.png': {
        width: canvas.widthPx,
        height: canvas.heightPx,
        colorType: 0,
        bitDepth: 8,
        meaning: '0 = fully opaque, 255 = max light transmission, linear',
      },
    },
    stats,
    exportedAt: params.exportedAt ?? new Date().toISOString(),
  };
}

export function serializeSettingsJson(doc: ExportSettingsJson): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(doc, null, 2));
}
