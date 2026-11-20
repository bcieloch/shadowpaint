export type MapId = 'color' | 'height' | 'opacity';

export type FitMode = 'fit' | 'fill' | 'stretch';

export type ImageFormat = 'png' | 'jpeg' | 'tiff';

export type LightingMode = 'front' | 'back' | 'combined';

export type BackLightType = 'point' | 'panel';

export type MeshDetail = 256 | 512 | 1024 | 2048;

export type ShadowMapSize = 2048 | 4096 | 8192;

export type PdfPageSize = 'A4' | 'A3' | 'Letter';

export type PdfOrientation = 'portrait' | 'landscape';

export type SelectionMode = 'protect' | 'editInside';

export type SelectionCombineMode = 'replace' | 'add' | 'subtract' | 'intersect';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ColorSpec {
  mode: 'kelvin' | 'rgb';
  kelvin: number;
  rgb: string;
}

export interface ImportTransform {
  scale: number;
  offsetXPx: number;
  offsetYPx: number;
  rotate90: 0 | 1 | 2 | 3;
  flipH: boolean;
  flipV: boolean;
  crop: Rect;
}

export interface MapSourceMeta {
  fileName: string;
  format: ImageFormat;
  widthPx: number;
  heightPx: number;
  bitDepth: number;
  fit: FitMode;
  transform: ImportTransform;
  importedAt: string;
}

export interface MapMeta {
  source: MapSourceMeta | null;
  locked: boolean;
  defaultValue: number | string;
}

export interface CanvasSettings {
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
  minThicknessMm: number;
  maxThicknessMm: number;
}

export interface ColorAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface HeightAdjustments {
  invert: boolean;
  contrast: number;
  gamma: number;
}

export interface OpacityAdjustments {
  invert: boolean;
  contrast: number;
  maxTransmissionPct: number;
  maxOpacityPct: number;
}

export interface AdjustmentsSettings {
  color: ColorAdjustments;
  height: HeightAdjustments;
  opacity: OpacityAdjustments;
}

export interface MaterialSettings {
  preset: string;
  roughness: number;
  muA: number;
  muS: number;
  kTint: number;
  canvasTransmittance: number;
  scatterRadiusMm: number;
  canvasBackColor: string;
}

export interface FrontLightSettings {
  xCm: number;
  heightAboveTopCm: number;
  distanceCm: number;
  targetXCm: number;
  targetYCm: number;
  intensity: number;
  color: ColorSpec;
  sourceSizeCm: number;
  coneAngleDeg: number;
  penumbra: number;
  castShadows: boolean;
  shadowMapSize: ShadowMapSize;
}

export interface BackLightSettings {
  type: BackLightType;
  xCm: number;
  yCm: number;
  distanceBehindCm: number;
  intensity: number;
  color: ColorSpec;
  globalTransmissionPct: number;
  attenuation: number;
}

export interface LightingSettings {
  mode: LightingMode;
  balance: number;
  exposure: number;
  ambientFront: number;
  ambientRoom: number;
  front: FrontLightSettings;
  back: BackLightSettings;
}

export interface View3DSettings {
  reliefMultiplier: number;
  meshDetail: MeshDetail;
  showFrame: boolean;
}

export interface GridSettings {
  spacingCm: number;
  subdivisions: number;
  color: string;
  opacity: number;
  show2D: boolean;
  show3D: boolean;
  labels: boolean;
}

export interface SelectionSettings {
  mode: SelectionMode;
  feather: number;
}

export interface ExportSettings {
  pdfPageSize: PdfPageSize;
  pdfOrientation: PdfOrientation;
  previewLongestSide: number;
  includePreviews: boolean;
  includeTiles1to1: boolean;
  gridSheetSpacingCm: number;
  colorPngAlpha: boolean;
}

export interface ProjectSettings {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  canvas: CanvasSettings;
  adjustments: AdjustmentsSettings;
  maps: Record<MapId, MapMeta>;
  material: MaterialSettings;
  lighting: LightingSettings;
  view3d: View3DSettings;
  grid: GridSettings;
  selection: SelectionSettings;
  export: ExportSettings;
}
