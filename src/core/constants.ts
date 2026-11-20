import { nanoid } from 'nanoid';
import type { CanvasSettings, ProjectSettings } from '@/core/types';

export const APP_VERSION = '0.1.0';
export const SCHEMA_VERSION = 1 as const;
export const REPOSITORY_URL = 'https://github.com/bcieloch/shadowpaint';
export const LICENSE_SPDX = 'AGPL-3.0-only';
export const AUTHOR_NAME = 'Brajan Cieloch';
export const IDEA_AUTHOR_NAME = 'Mateusz Prawecki';

export const TILE_SIZE = 256;
export const CM_PER_INCH = 2.54;
export const MM_PER_CM = 10;

export const MIN_CANVAS_CM = 1;
export const MAX_CANVAS_CM = 1000;
export const MIN_PROJECT_PX = 16;
export const MAX_PROJECT_PX = 16384;
export const MAX_MEGAPIXELS_WARNING = 16_000_000;

export const MIN_THICKNESS_MM = 0;
export const MAX_THICKNESS_MM = 50;

export const MIN_RELIEF_MULTIPLIER = 1;
export const MAX_RELIEF_MULTIPLIER = 50;

export const ASPECT_RATIO_TOLERANCE = 0.005;

/**
 * Calibrates Three.js physically-based SpotLight (candela, with Lambertian BRDF 1/π)
 * in 1 world unit = 1 cm coordinates so that at intensity = 1 and exposure = 1,
 * a perpendicular white surface at the target renders at linear radiance ≈ (0.8, 0.8, 0.8)
 * before ACES Filmic tone mapping.
 */
export const FRONT_LIGHT_INTENSITY_FACTOR = 0.8 * Math.PI;

export const MIN_EXPOSURE = 0.1;
export const MAX_EXPOSURE = 4;
export const MIN_AMBIENT = 0;
export const MAX_AMBIENT = 1;
export const MIN_LIGHT_INTENSITY = 0;
export const MAX_LIGHT_INTENSITY = 10;
export const MIN_KELVIN = 1500;
export const MAX_KELVIN = 12000;
export const MIN_SOURCE_SIZE_CM = 0.1;
export const MAX_SOURCE_SIZE_CM = 50;
export const MIN_CONE_ANGLE_DEG = 10;
export const MAX_CONE_ANGLE_DEG = 120;
export const MIN_SHADOW_DISTANCE_CM = 1;
export const MIN_INCIDENCE_DEG = 0;
export const MAX_INCIDENCE_DEG = 89;

export const MIN_BACK_DISTANCE_CM = 1;
export const MAX_BACK_DISTANCE_CM = 500;
export const MIN_GLOBAL_TRANSMISSION_PCT = 0;
export const MAX_GLOBAL_TRANSMISSION_PCT = 200;
export const MIN_ATTENUATION = 0;
export const MAX_ATTENUATION = 5;

export const MIN_ROUGHNESS = 0.05;
export const MAX_ROUGHNESS = 1;
export const MIN_MU_A = 0;
export const MAX_MU_A = 20;
export const MIN_MU_S = 0;
export const MAX_MU_S = 20;
export const MIN_K_TINT = 0;
export const MAX_K_TINT = 1;
export const MIN_CANVAS_TRANSMITTANCE = 0;
export const MAX_CANVAS_TRANSMITTANCE = 1;

export const DEFAULT_COLOR_HEX = '#f4f1ea';
export const DEFAULT_HEIGHT_VALUE = 0;
export const DEFAULT_OPACITY_VALUE = 1;

export interface CanvasPreset {
  id: string;
  widthCm: number;
  heightCm: number;
}

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: '30x40', widthCm: 30, heightCm: 40 },
  { id: '40x50', widthCm: 40, heightCm: 50 },
  { id: '50x70', widthCm: 50, heightCm: 70 },
  { id: '60x80', widthCm: 60, heightCm: 80 },
  { id: '70x100', widthCm: 70, heightCm: 100 },
  { id: '100x100', widthCm: 100, heightCm: 100 },
  { id: 'A4', widthCm: 21, heightCm: 29.7 },
  { id: 'A3', widthCm: 29.7, heightCm: 42 },
  { id: 'A2', widthCm: 42, heightCm: 59.4 },
];

export const DEFAULT_CANVAS: CanvasSettings = {
  widthCm: 50,
  heightCm: 70,
  widthPx: 3000,
  heightPx: 4200,
  minThicknessMm: 0,
  maxThicknessMm: 5,
};

export interface CreateDefaultProjectOptions {
  id?: string;
  name?: string;
  canvas?: Partial<CanvasSettings>;
  now?: string;
}

export function createDefaultProject(options: CreateDefaultProjectOptions = {}): ProjectSettings {
  const now = options.now ?? new Date().toISOString();
  const canvas: CanvasSettings = {
    ...DEFAULT_CANVAS,
    ...options.canvas,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? nanoid(),
    name: options.name ?? 'Untitled',
    createdAt: now,
    updatedAt: now,
    appVersion: APP_VERSION,
    canvas,
    adjustments: {
      color: { brightness: 0, contrast: 0, saturation: 0 },
      height: { invert: false, contrast: 0, gamma: 1 },
      opacity: { invert: false, contrast: 0, maxTransmissionPct: 100, maxOpacityPct: 100 },
    },
    maps: {
      color: { source: null, locked: false, defaultValue: DEFAULT_COLOR_HEX },
      height: { source: null, locked: false, defaultValue: DEFAULT_HEIGHT_VALUE },
      opacity: { source: null, locked: false, defaultValue: DEFAULT_OPACITY_VALUE },
    },
    material: {
      preset: 'custom',
      roughness: 0.55,
      muA: 0.9,
      muS: 0.6,
      kTint: 0.85,
      canvasTransmittance: 0.65,
      scatterRadiusMm: 0.8,
      canvasBackColor: '#d9d2c3',
    },
    lighting: {
      mode: 'combined',
      balance: 0.5,
      exposure: 1,
      ambientFront: 0.08,
      ambientRoom: 0.02,
      front: {
        xCm: canvas.widthCm / 2,
        heightAboveTopCm: 30,
        distanceCm: 60,
        targetXCm: canvas.widthCm / 2,
        targetYCm: canvas.heightCm / 2,
        intensity: 1,
        color: { mode: 'kelvin', kelvin: 4000, rgb: '#fff1e0' },
        sourceSizeCm: 5,
        coneAngleDeg: 60,
        penumbra: 0.3,
        castShadows: true,
        shadowMapSize: 4096,
      },
      back: {
        type: 'point',
        xCm: canvas.widthCm / 2,
        yCm: canvas.heightCm / 2,
        distanceBehindCm: 20,
        intensity: 1,
        color: { mode: 'kelvin', kelvin: 5000, rgb: '#fff9f2' },
        globalTransmissionPct: 100,
        attenuation: 1,
      },
    },
    view3d: {
      reliefMultiplier: 1,
      meshDetail: 1024,
      showFrame: true,
    },
    grid: {
      spacingCm: 5,
      subdivisions: 5,
      color: '#f59e0b',
      opacity: 0.35,
      show2D: false,
      show3D: false,
      labels: true,
    },
    selection: {
      mode: 'protect',
      feather: 0,
    },
    export: {
      pdfPageSize: 'A4',
      pdfOrientation: 'landscape',
      previewLongestSide: 2048,
      includePreviews: true,
      includeTiles1to1: false,
      gridSheetSpacingCm: 5,
      colorPngAlpha: false,
    },
  };
}
