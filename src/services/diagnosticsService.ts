import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId } from '@/core/types';
import { type GpuQualityPreset, selectRecommendedQuality } from '@/core/units/gpuQuality';
import type { EnginePerformanceSnapshot } from '@/engine3d/Engine';
import { type GpuCapabilities, probeGpuCapabilities } from '@/lib/webgl';
import { getAdjustServiceTimingStats } from '@/services/adjustService';
import { recordSettingsPatchHistory } from '@/services/historyService';
import { useProjectStore } from '@/state/projectStore';
import { getWorkerPoolStats, type WorkerPoolStats } from '@/workers/pool';

let enginePerformanceProvider: (() => EnginePerformanceSnapshot) | null = null;

export function registerEnginePerformanceProvider(
  provider: (() => EnginePerformanceSnapshot) | null,
): void {
  enginePerformanceProvider = provider;
}

export function getEnginePerformanceSnapshot(): EnginePerformanceSnapshot | null {
  return enginePerformanceProvider ? enginePerformanceProvider() : null;
}

export interface DiagnosticsSnapshot {
  engine: EnginePerformanceSnapshot | null;
  gpu: GpuCapabilities;
  workers: WorkerPoolStats;
  adjustTimingsMs: Record<MapId, number | null>;
  dirtyTilesCount: number;
}

export function getDiagnosticsSnapshot(): DiagnosticsSnapshot {
  return {
    engine: getEnginePerformanceSnapshot(),
    gpu: probeGpuCapabilities(),
    workers: getWorkerPoolStats(),
    adjustTimingsMs: getAdjustServiceTimingStats(),
    dirtyTilesCount: mapRegistry.isAllocated ? mapRegistry.dirtyTiles.getDirtyCount() : 0,
  };
}

export function optimizeQualityForGpu(): GpuQualityPreset {
  const caps = probeGpuCapabilities();
  const preset = selectRecommendedQuality(caps);
  const projectStore = useProjectStore.getState();

  const viewBefore = structuredClone(projectStore.project.view3d);
  const lightBefore = structuredClone(projectStore.project.lighting);

  projectStore.updateProject((draft) => {
    draft.view3d.meshDetail = preset.meshDetail;
    draft.lighting.front.shadowMapSize = preset.shadowMapSize;
  }, true);

  const viewAfter = structuredClone(useProjectStore.getState().project.view3d);
  const lightAfter = structuredClone(useProjectStore.getState().project.lighting);

  recordSettingsPatchHistory('settingsChange', {
    path: 'view3d',
    before: viewBefore,
    after: viewAfter,
  });
  recordSettingsPatchHistory('settingsChange', {
    path: 'lighting',
    before: lightBefore,
    after: lightAfter,
  });

  return preset;
}
