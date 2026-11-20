import { createDefaultProject } from '@/core/constants';
import type { ProjectSettings } from '@/core/types';

function mergeShallowRecord<T extends object>(base: T, incoming: unknown): T {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { ...base };
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  const record = incoming as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    if (record[key] !== undefined) {
      result[key] = record[key];
    }
  }
  return result as T;
}

export function migrateProjectSettings(raw: unknown): ProjectSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid project settings object');
  }
  const rec = raw as Record<string, unknown>;
  const defaults = createDefaultProject();

  const schemaVersion = typeof rec.schemaVersion === 'number' ? rec.schemaVersion : 1;
  if (schemaVersion > 1) {
    throw new Error(`Unsupported schemaVersion: ${schemaVersion}`);
  }

  const canvas = mergeShallowRecord(defaults.canvas, rec.canvas);
  const rawAdj =
    rec.adjustments && typeof rec.adjustments === 'object'
      ? (rec.adjustments as Record<string, unknown>)
      : {};
  const rawMaps =
    rec.maps && typeof rec.maps === 'object' ? (rec.maps as Record<string, unknown>) : {};
  const rawLighting =
    rec.lighting && typeof rec.lighting === 'object'
      ? (rec.lighting as Record<string, unknown>)
      : {};
  const rawFront =
    rawLighting.front && typeof rawLighting.front === 'object'
      ? (rawLighting.front as Record<string, unknown>)
      : {};
  const rawBack =
    rawLighting.back && typeof rawLighting.back === 'object'
      ? (rawLighting.back as Record<string, unknown>)
      : {};

  return {
    schemaVersion: 1,
    id: typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : defaults.id,
    name: typeof rec.name === 'string' && rec.name.length > 0 ? rec.name : defaults.name,
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : defaults.createdAt,
    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : defaults.updatedAt,
    appVersion: typeof rec.appVersion === 'string' ? rec.appVersion : defaults.appVersion,
    canvas,
    adjustments: {
      color: mergeShallowRecord(defaults.adjustments.color, rawAdj.color),
      height: mergeShallowRecord(defaults.adjustments.height, rawAdj.height),
      opacity: mergeShallowRecord(defaults.adjustments.opacity, rawAdj.opacity),
    },
    maps: {
      color: mergeShallowRecord(defaults.maps.color, rawMaps.color),
      height: mergeShallowRecord(defaults.maps.height, rawMaps.height),
      opacity: mergeShallowRecord(defaults.maps.opacity, rawMaps.opacity),
    },
    material: mergeShallowRecord(defaults.material, rec.material),
    lighting: {
      ...mergeShallowRecord(defaults.lighting, rawLighting),
      front: {
        ...mergeShallowRecord(defaults.lighting.front, rawFront),
        color: mergeShallowRecord(defaults.lighting.front.color, rawFront.color),
      },
      back: {
        ...mergeShallowRecord(defaults.lighting.back, rawBack),
        color: mergeShallowRecord(defaults.lighting.back.color, rawBack.color),
      },
    },
    view3d: mergeShallowRecord(defaults.view3d, rec.view3d),
    grid: mergeShallowRecord(defaults.grid, rec.grid),
    selection: mergeShallowRecord(defaults.selection, rec.selection),
    export: mergeShallowRecord(defaults.export, rec.export),
  };
}
