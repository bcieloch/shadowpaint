import { zipSync, type Zippable } from 'fflate';
import { computeHasSelection } from '@/core/maps/MapRegistry';
import type { ProjectSettings } from '@/core/types';
import { encodeColorPng, encodeGrayscaleMapPng } from '@/export/png';
import { buildExportSettingsJson, serializeSettingsJson } from '@/export/settingsJson';
import { crc32Hex, float32ToLittleEndianBytes } from '@/lib/bytes';
import { encodeThumbnailPngSync } from '@/persistence/thumbnail';

export const RELIEF_MANIFEST_FORMAT = 'shadowpaint-project';
export const RELIEF_FORMAT_VERSION = 1;

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
  colorBase: Uint8Array;
  colorWorking: Uint8Array;
  colorEffective: Uint8Array;
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
      crc32: crc32Hex(colorBase),
    },
    {
      file: 'maps/color.working.rgba',
      dtype: 'rgba8',
      width: widthPx,
      height: heightPx,
      channels: 4,
      endian: 'none',
      crc32: crc32Hex(colorWorking),
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
    'maps/color.base.rgba': [colorBase, { level: 6 }],
    'maps/color.working.rgba': [colorWorking, { level: 6 }],
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
