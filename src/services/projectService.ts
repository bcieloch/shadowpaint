import { createDefaultProject, type CreateDefaultProjectOptions } from '@/core/constants';
import { MapMemoryError, mapRegistry } from '@/core/maps/MapRegistry';
import type { ProjectSettings } from '@/core/types';
import { useProjectStore } from '@/state/projectStore';
import '@/state/mapsVersion';

export type ProjectCreateResult =
  | { ok: true; project: ProjectSettings }
  | { ok: false; error: 'outOfMemory'; requiredMb: number };

export function createAndActivateProject(
  options: CreateDefaultProjectOptions = {},
): ProjectCreateResult {
  const settings = createDefaultProject(options);
  try {
    mapRegistry.allocate(settings.canvas.widthPx, settings.canvas.heightPx, {
      color: String(settings.maps.color.defaultValue),
      height: Number(settings.maps.height.defaultValue),
      opacity: Number(settings.maps.opacity.defaultValue),
    });
  } catch (err) {
    if (err instanceof MapMemoryError) {
      return {
        ok: false,
        error: 'outOfMemory',
        requiredMb: Math.round(err.requiredBytes / (1024 * 1024)),
      };
    }
    throw err;
  }

  useProjectStore.getState().setProject(settings, false);
  return { ok: true, project: settings };
}

export function ensureInitialProjectAllocated(): ProjectCreateResult {
  if (mapRegistry.isAllocated) {
    return { ok: true, project: useProjectStore.getState().project };
  }
  const current = useProjectStore.getState().project;
  return createAndActivateProject({
    id: current.id,
    name: current.name,
    canvas: current.canvas,
    now: current.createdAt,
  });
}
