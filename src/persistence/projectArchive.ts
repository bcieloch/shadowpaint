import { decode as decodePng } from 'fast-png';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import {
  DEFAULT_COLOR_HEX,
  DEFAULT_HEIGHT_VALUE,
  DEFAULT_OPACITY_VALUE,
} from '@/core/constants';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';
import { computeHasSelection } from '@/core/maps/MapRegistry';
import { clamp01 } from '@/core/maps/quantize';
import type { ProjectSettings } from '@/core/types';
import { hexToRgb01 } from '@/core/units/colorTemperature';
import { encodeColorPng, encodeGrayscaleMapPng } from '@/export/png';
import { buildExportSettingsJson, serializeSettingsJson } from '@/export/settingsJson';
import {
  asUint8Array,
  crc32Hex,
  float32ToLittleEndianBytes,
  littleEndianBytesToFloat32,
  uint8ToClampedRgba,
} from '@/lib/bytes';
import { migrateProjectSettings } from '@/persistence/migrations';
import { encodeThumbnailPngSync } from '@/persistence/thumbnail';

export const RELIEF_MANIFEST_FORMAT = 'shadowpaint-project';
export const RELIEF_FORMAT_VERSION = 1;

export class ProjectCorruptedError extends Error {
  readonly reason: string;

  constructor(reason: string, cause?: unknown) {
    super(`Corrupted .relief project: ${reason}`);
    this.name = 'ProjectCorruptedError';
    this.reason = reason;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function isProjectCorruptedError(err: unknown): boolean {
  if (err instanceof ProjectCorruptedError) return true;
  if (err instanceof Error) {
    return (
      err.name === 'ProjectCorruptedError' ||
      err.message.startsWith('Corrupted .relief project:')
    );
  }
  return false;
}

export interface ReliefManifest {
  format: typeof RELIEF_MANIFEST_FORMAT;
  formatVersion: number;
  appVersion: string;
  createdWith: 'ShadowPaint';
}

export interface ReliefMapIndexEntry {
  file: string;
  dtype: 'rgba8' | 'float32' | 'uint8';
  width: number;
  height: number;
  channels: number;
  endian: 'little' | 'none';
  crc32: string;
}

export interface PackReliefProjectInput {
  project: ProjectSettings;
  colorBase: Uint8Array | Uint8ClampedArray;
  colorWorking: Uint8Array | Uint8ClampedArray;
  colorEffective: Uint8Array | Uint8ClampedArray;
  heightBase: Float32Array;
  heightWorking: Float32Array;
  heightEffective: Float32Array;
  opacityBase: Float32Array;
  opacityWorking: Float32Array;
  opacityEffective: Float32Array;
  selection?: Uint8Array;
  exportedAt?: string;
  onProgress?: (progress01: number) => void;
}

export interface UnpackedReliefProject {
  project: ProjectSettings;
  colorBase: Uint8ClampedArray;
  colorWorking: Uint8ClampedArray;
  colorEffective: Uint8ClampedArray;
  heightBase: Float32Array;
  heightWorking: Float32Array;
  heightEffective: Float32Array;
  opacityBase: Float32Array;
  opacityWorking: Float32Array;
  opacityEffective: Float32Array;
  selection: Uint8Array;
  usedPngFallback: boolean;
}

export function packReliefProject(input: PackReliefProjectInput): Uint8Array {
  const {
    project,
    colorBase,
    colorWorking,
    colorEffective,
    heightBase,
    heightWorking,
    heightEffective,
    opacityBase,
    opacityWorking,
    opacityEffective,
    selection,
    onProgress,
  } = input;
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const { widthPx, heightPx } = project.canvas;
  const encoder = new TextEncoder();

  onProgress?.(0.08);
  const manifest: ReliefManifest = {
    format: RELIEF_MANIFEST_FORMAT,
    formatVersion: RELIEF_FORMAT_VERSION,
    appVersion: project.appVersion,
    createdWith: 'ShadowPaint',
  };

  const settingsDoc = buildExportSettingsJson({
    project,
    heightEffective,
    opacityEffective,
    exportedAt,
  });
  const settingsBytes = serializeSettingsJson(settingsDoc);
  onProgress?.(0.2);

  const heightBaseBytes = float32ToLittleEndianBytes(heightBase);
  const heightWorkingBytes = float32ToLittleEndianBytes(heightWorking);
  const opacityBaseBytes = float32ToLittleEndianBytes(opacityBase);
  const opacityWorkingBytes = float32ToLittleEndianBytes(opacityWorking);
  onProgress?.(0.4);

  const indexEntries: ReliefMapIndexEntry[] = [
    {
      file: 'maps/color.base.rgba',
      dtype: 'rgba8',
      width: widthPx,
      height: heightPx,
      channels: 4,
      endian: 'none',
      crc32: crc32Hex(asUint8Array(colorBase)),
    },
    {
      file: 'maps/color.working.rgba',
      dtype: 'rgba8',
      width: widthPx,
      height: heightPx,
      channels: 4,
      endian: 'none',
      crc32: crc32Hex(asUint8Array(colorWorking)),
    },
    {
      file: 'maps/height.base.f32',
      dtype: 'float32',
      width: widthPx,
      height: heightPx,
      channels: 1,
      endian: 'little',
      crc32: crc32Hex(heightBaseBytes),
    },
    {
      file: 'maps/height.working.f32',
      dtype: 'float32',
      width: widthPx,
      height: heightPx,
      channels: 1,
      endian: 'little',
      crc32: crc32Hex(heightWorkingBytes),
    },
    {
      file: 'maps/opacity.base.f32',
      dtype: 'float32',
      width: widthPx,
      height: heightPx,
      channels: 1,
      endian: 'little',
      crc32: crc32Hex(opacityBaseBytes),
    },
    {
      file: 'maps/opacity.working.f32',
      dtype: 'float32',
      width: widthPx,
      height: heightPx,
      channels: 1,
      endian: 'little',
      crc32: crc32Hex(opacityWorkingBytes),
    },
  ];

  const entries: Zippable = {
    'manifest.json': [encoder.encode(JSON.stringify(manifest, null, 2)), { level: 6 }],
    'project_settings.json': [settingsBytes, { level: 6 }],
    'maps/color.base.rgba': [asUint8Array(colorBase), { level: 6 }],
    'maps/color.working.rgba': [asUint8Array(colorWorking), { level: 6 }],
    'maps/height.base.f32': [heightBaseBytes, { level: 6 }],
    'maps/height.working.f32': [heightWorkingBytes, { level: 6 }],
    'maps/opacity.base.f32': [opacityBaseBytes, { level: 6 }],
    'maps/opacity.working.f32': [opacityWorkingBytes, { level: 6 }],
  };

  if (selection && computeHasSelection(selection)) {
    indexEntries.push({
      file: 'maps/selection.u8',
      dtype: 'uint8',
      width: widthPx,
      height: heightPx,
      channels: 1,
      endian: 'none',
      crc32: crc32Hex(selection),
    });
    entries['maps/selection.u8'] = [selection, { level: 6 }];
  }

  entries['maps/index.json'] = [
    encoder.encode(JSON.stringify(indexEntries, null, 2)),
    { level: 6 },
  ];
  onProgress?.(0.6);

  const colorPreview = encodeColorPng(
    colorEffective,
    widthPx,
    heightPx,
    project.export.colorPngAlpha,
  );
  const heightPreview = encodeGrayscaleMapPng(heightEffective, widthPx, heightPx);
  const opacityPreview = encodeGrayscaleMapPng(opacityEffective, widthPx, heightPx);
  const thumbnailPng = encodeThumbnailPngSync(colorEffective, widthPx, heightPx, 512);
  onProgress?.(0.8);

  entries['previews/color_map.png'] = [colorPreview, { level: 6 }];
  entries['previews/height_map.png'] = [heightPreview, { level: 6 }];
  entries['previews/opacity_map.png'] = [opacityPreview, { level: 6 }];
  entries['previews/thumbnail.png'] = [thumbnailPng, { level: 6 }];

  const zipBytes = zipSync(entries, { level: 6 });
  onProgress?.(1);
  return zipBytes;
}

const REQUIRED_RAW_FILES = [
  'maps/color.base.rgba',
  'maps/color.working.rgba',
  'maps/height.base.f32',
  'maps/height.working.f32',
  'maps/opacity.base.f32',
  'maps/opacity.working.f32',
] as const;

function parseJsonEntry(files: Record<string, Uint8Array>, path: string): unknown {
  const bytes = files[path];
  if (!bytes) {
    throw new ProjectCorruptedError(`Missing ${path}`);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (err) {
    throw new ProjectCorruptedError(`Invalid JSON in ${path}`, err);
  }
}

function bytesPerElementForDtype(dtype: ReliefMapIndexEntry['dtype']): number {
  if (dtype === 'float32') return 4;
  return 1;
}

function decodeColorPngFallback(
  bytes: Uint8Array,
  expectedW: number,
  expectedH: number,
): Uint8ClampedArray {
  let decoded: ReturnType<typeof decodePng>;
  try {
    decoded = decodePng(bytes);
  } catch (err) {
    throw new ProjectCorruptedError('Invalid color PNG fallback', err);
  }
  if (decoded.width !== expectedW || decoded.height !== expectedH) {
    throw new ProjectCorruptedError('Color PNG dimensions mismatch');
  }
  const pixelCount = expectedW * expectedH;
  const channels = Math.round(decoded.data.length / pixelCount);
  const scale = decoded.depth === 16 ? 255 / 65535 : 1;
  const out = new Uint8ClampedArray(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    const dst = i * 4;
    if (channels === 1 || channels === 2) {
      const g = Math.round((decoded.data[i * channels] ?? 0) * scale);
      out[dst] = g;
      out[dst + 1] = g;
      out[dst + 2] = g;
      out[dst + 3] = channels === 2 ? Math.round((decoded.data[i * 2 + 1] ?? 255) * scale) : 255;
    } else if (channels === 3) {
      const src = i * 3;
      out[dst] = Math.round((decoded.data[src] ?? 0) * scale);
      out[dst + 1] = Math.round((decoded.data[src + 1] ?? 0) * scale);
      out[dst + 2] = Math.round((decoded.data[src + 2] ?? 0) * scale);
      out[dst + 3] = 255;
    } else if (channels === 4) {
      const src = i * 4;
      out[dst] = Math.round((decoded.data[src] ?? 0) * scale);
      out[dst + 1] = Math.round((decoded.data[src + 1] ?? 0) * scale);
      out[dst + 2] = Math.round((decoded.data[src + 2] ?? 0) * scale);
      out[dst + 3] = Math.round((decoded.data[src + 3] ?? 255) * scale);
    } else {
      throw new ProjectCorruptedError(`Unsupported PNG channel count: ${channels}`);
    }
  }
  return out;
}

function decodeScalarPngFallback(
  bytes: Uint8Array,
  expectedW: number,
  expectedH: number,
): Float32Array {
  let decoded: ReturnType<typeof decodePng>;
  try {
    decoded = decodePng(bytes);
  } catch (err) {
    throw new ProjectCorruptedError('Invalid scalar PNG fallback', err);
  }
  if (decoded.width !== expectedW || decoded.height !== expectedH) {
    throw new ProjectCorruptedError('Scalar PNG dimensions mismatch');
  }
  const pixelCount = expectedW * expectedH;
  const channels = Math.round(decoded.data.length / pixelCount);
  if (channels < 1 || channels > 4) {
    throw new ProjectCorruptedError(`Unsupported PNG channel count: ${channels}`);
  }
  const invMax = decoded.depth === 16 ? 1 / 65535 : 1 / 255;
  const out = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    if (channels <= 2) {
      out[i] = clamp01((decoded.data[i * channels] ?? 0) * invMax);
    } else {
      const src = i * channels;
      const r = (decoded.data[src] ?? 0) * invMax;
      const g = (decoded.data[src + 1] ?? 0) * invMax;
      const b = (decoded.data[src + 2] ?? 0) * invMax;
      out[i] = clamp01(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }
  return out;
}

export function unpackReliefProject(
  zipBytes: Uint8Array,
  onProgress?: (progress01: number) => void,
): UnpackedReliefProject {
  onProgress?.(0.05);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch (err) {
    throw new ProjectCorruptedError('Invalid ZIP archive', err);
  }
  onProgress?.(0.2);

  if (files['manifest.json']) {
    const manifest = parseJsonEntry(files, 'manifest.json') as Partial<ReliefManifest> | null;
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      manifest.format !== RELIEF_MANIFEST_FORMAT ||
      typeof manifest.formatVersion !== 'number' ||
      manifest.formatVersion < 1 ||
      manifest.formatVersion > RELIEF_FORMAT_VERSION
    ) {
      throw new ProjectCorruptedError('Invalid or unsupported manifest.json');
    }
  }

  const rawSettingsDoc = parseJsonEntry(files, 'project_settings.json') as
    | { format?: string; project?: unknown }
    | Record<string, unknown>;
  const settingsSource =
    rawSettingsDoc &&
    typeof rawSettingsDoc === 'object' &&
    'project' in rawSettingsDoc &&
    rawSettingsDoc.project
      ? rawSettingsDoc.project
      : rawSettingsDoc;

  let project: ProjectSettings;
  try {
    project = migrateProjectSettings(settingsSource);
  } catch (err) {
    throw new ProjectCorruptedError('Invalid project_settings.json', err);
  }

  const { widthPx, heightPx } = project.canvas;
  const pixelCount = widthPx * heightPx;
  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx < 1 || heightPx < 1) {
    throw new ProjectCorruptedError('Invalid canvas dimensions in settings');
  }
  onProgress?.(0.35);

  const hasIndexJson = Boolean(files['maps/index.json']);
  const hasAnyRawMap = REQUIRED_RAW_FILES.some((f) => Boolean(files[f])) || Boolean(files['maps/selection.u8']);

  let colorBase: Uint8ClampedArray;
  let colorWorking: Uint8ClampedArray;
  let heightBase: Float32Array;
  let heightWorking: Float32Array;
  let opacityBase: Float32Array;
  let opacityWorking: Float32Array;
  let selection = new Uint8Array(pixelCount);
  let usedPngFallback = false;

  if (hasIndexJson || hasAnyRawMap) {
    if (!hasIndexJson) {
      throw new ProjectCorruptedError('Missing maps/index.json');
    }
    const rawIndex = parseJsonEntry(files, 'maps/index.json');
    if (!Array.isArray(rawIndex)) {
      throw new ProjectCorruptedError('Invalid maps/index.json format');
    }

    const indexByFile = new Map<string, ReliefMapIndexEntry>();
    for (const item of rawIndex) {
      if (!item || typeof item !== 'object') {
        throw new ProjectCorruptedError('Invalid entry in maps/index.json');
      }
      const entry = item as Partial<ReliefMapIndexEntry>;
      if (
        typeof entry.file !== 'string' ||
        (entry.dtype !== 'rgba8' && entry.dtype !== 'float32' && entry.dtype !== 'uint8') ||
        typeof entry.width !== 'number' ||
        typeof entry.height !== 'number' ||
        typeof entry.channels !== 'number' ||
        typeof entry.crc32 !== 'string'
      ) {
        throw new ProjectCorruptedError('Malformed entry in maps/index.json');
      }
      const bytes = files[entry.file];
      if (!bytes) {
        throw new ProjectCorruptedError(`Missing referenced map file: ${entry.file}`);
      }
      if (entry.width !== widthPx || entry.height !== heightPx) {
        throw new ProjectCorruptedError(`Dimension mismatch for ${entry.file}`);
      }
      const expectedBytes =
        pixelCount * entry.channels * bytesPerElementForDtype(entry.dtype);
      if (bytes.byteLength !== expectedBytes) {
        throw new ProjectCorruptedError(`Byte size mismatch for ${entry.file}`);
      }
      if (crc32Hex(bytes) !== entry.crc32.toLowerCase()) {
        throw new ProjectCorruptedError(`CRC32 checksum mismatch for ${entry.file}`);
      }
      indexByFile.set(entry.file, entry as ReliefMapIndexEntry);
    }

    for (const requiredFile of REQUIRED_RAW_FILES) {
      if (!indexByFile.has(requiredFile)) {
        throw new ProjectCorruptedError(`Required map missing from index: ${requiredFile}`);
      }
    }
    if (files['maps/selection.u8'] && !indexByFile.has('maps/selection.u8')) {
      throw new ProjectCorruptedError('Selection file is not indexed in maps/index.json');
    }

    const colorBaseBytes = files['maps/color.base.rgba'];
    const colorWorkingBytes = files['maps/color.working.rgba'];
    const heightBaseBytes = files['maps/height.base.f32'];
    const heightWorkingBytes = files['maps/height.working.f32'];
    const opacityBaseBytes = files['maps/opacity.base.f32'];
    const opacityWorkingBytes = files['maps/opacity.working.f32'];

    if (
      !colorBaseBytes ||
      !colorWorkingBytes ||
      !heightBaseBytes ||
      !heightWorkingBytes ||
      !opacityBaseBytes ||
      !opacityWorkingBytes
    ) {
      throw new ProjectCorruptedError('Missing required raw map buffers');
    }

    colorBase = uint8ToClampedRgba(colorBaseBytes);
    colorWorking = uint8ToClampedRgba(colorWorkingBytes);
    heightBase = littleEndianBytesToFloat32(heightBaseBytes);
    heightWorking = littleEndianBytesToFloat32(heightWorkingBytes);
    opacityBase = littleEndianBytesToFloat32(opacityBaseBytes);
    opacityWorking = littleEndianBytesToFloat32(opacityWorkingBytes);

    if (files['maps/selection.u8']) {
      selection = new Uint8Array(files['maps/selection.u8']);
    }
  } else {
    // Fallback: reconstruct maps from PNG previews + project settings
    const colorPng = files['previews/color_map.png'] ?? files['color_map.png'];
    const heightPng = files['previews/height_map.png'] ?? files['height_map.png'];
    const opacityPng = files['previews/opacity_map.png'] ?? files['opacity_map.png'];

    if (!colorPng && !heightPng && !opacityPng) {
      throw new ProjectCorruptedError('Archive contains neither raw map buffers nor PNG previews');
    }
    usedPngFallback = true;

    if (colorPng) {
      colorBase = decodeColorPngFallback(colorPng, widthPx, heightPx);
    } else {
      const rgb = hexToRgb01(DEFAULT_COLOR_HEX);
      const r = Math.round(rgb.r * 255);
      const g = Math.round(rgb.g * 255);
      const b = Math.round(rgb.b * 255);
      colorBase = new Uint8ClampedArray(pixelCount * 4);
      for (let i = 0; i < pixelCount; i++) {
        const o = i * 4;
        colorBase[o] = r;
        colorBase[o + 1] = g;
        colorBase[o + 2] = b;
        colorBase[o + 3] = 255;
      }
    }
    colorWorking = new Uint8ClampedArray(colorBase);

    if (heightPng) {
      heightBase = decodeScalarPngFallback(heightPng, widthPx, heightPx);
    } else {
      heightBase = new Float32Array(pixelCount).fill(DEFAULT_HEIGHT_VALUE);
    }
    heightWorking = new Float32Array(heightBase);

    if (opacityPng) {
      opacityBase = decodeScalarPngFallback(opacityPng, widthPx, heightPx);
    } else {
      opacityBase = new Float32Array(pixelCount).fill(DEFAULT_OPACITY_VALUE);
    }
    opacityWorking = new Float32Array(opacityBase);
  }

  onProgress?.(0.75);

  const colorEffective = new Uint8ClampedArray(pixelCount * 4);
  const heightEffective = new Float32Array(pixelCount);
  const opacityEffective = new Float32Array(pixelCount);

  applyColorAdjustments(colorWorking, colorEffective, widthPx, heightPx, project.adjustments.color);
  applyHeightAdjustments(
    heightWorking,
    heightEffective,
    widthPx,
    heightPx,
    project.adjustments.height,
  );
  applyOpacityAdjustments(
    opacityWorking,
    opacityEffective,
    widthPx,
    heightPx,
    project.adjustments.opacity,
  );

  onProgress?.(1);
  return {
    project,
    colorBase,
    colorWorking,
    colorEffective,
    heightBase,
    heightWorking,
    heightEffective,
    opacityBase,
    opacityWorking,
    opacityEffective,
    selection,
    usedPngFallback,
  };
}
