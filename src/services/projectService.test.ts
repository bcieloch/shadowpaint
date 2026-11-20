import { describe, expect, it } from 'vitest';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { createAndActivateProject } from '@/services/projectService';
import { useMapsVersionStore } from '@/state/mapsVersion';
import { useProjectStore } from '@/state/projectStore';

describe('projectService', () => {
  it('allocates maps and updates projectStore and mapsVersion', () => {
    const initialVersion = useMapsVersionStore.getState().version;
    const res = createAndActivateProject({
      name: 'Relief Study',
      canvas: {
        widthCm: 40,
        heightCm: 50,
        widthPx: 80,
        heightPx: 100,
        minThicknessMm: 0.5,
        maxThicknessMm: 4.5,
      },
    });

    expect(res.ok).toBe(true);
    expect(useProjectStore.getState().project.name).toBe('Relief Study');
    expect(mapRegistry.width).toBe(80);
    expect(mapRegistry.height).toBe(100);
    expect(useMapsVersionStore.getState().version).toBeGreaterThan(initialVersion);
  });

  it('returns outOfMemory when buffer allocation exceeds memory limits', () => {
    const res = createAndActivateProject({
      name: 'Too Huge',
      canvas: {
        widthCm: 100,
        heightCm: 100,
        widthPx: 1_000_000,
        heightPx: 1_000_000,
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('outOfMemory');
      expect(res.requiredMb).toBeGreaterThan(0);
    }
  });
});
