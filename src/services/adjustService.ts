import { proxy, transfer } from 'comlink';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId } from '@/core/types';
import { valueToMm } from '@/core/units/calibration';
import { useProjectStore } from '@/state/projectStore';
import { getImageWorker } from '@/workers/client';
import { runTask } from '@/workers/tasks';

const requestSeq: Record<MapId, number> = {
  color: 0,
  height: 0,
  opacity: 0,
};

export async function recomputeEffectiveMap(mapId: MapId): Promise<void> {
  if (!mapRegistry.isAllocated) return;
  const seq = ++requestSeq[mapId];
  const { width, height } = mapRegistry;
  const project = useProjectStore.getState().project;
  const worker = getImageWorker();

  if (mapId === 'color') {
    const copy = new Uint8ClampedArray(mapRegistry.color.working);
    const out = await worker.computeEffectiveColor(
      transfer(copy, [copy.buffer]),
      width,
      height,
      project.adjustments.color,
    );
    if (seq !== requestSeq.color) return;
    mapRegistry.color.replaceEffective(out);
    mapRegistry.emitReplaced('color');
    return;
  }

  if (mapId === 'height') {
    const copy = new Float32Array(mapRegistry.heightMap.working);
    const out = await worker.computeEffectiveHeight(
      transfer(copy, [copy.buffer]),
      width,
      height,
      project.adjustments.height,
    );
    if (seq !== requestSeq.height) return;
    mapRegistry.heightMap.replaceEffective(out);
    mapRegistry.emitReplaced('height');
    return;
  }

  const copy = new Float32Array(mapRegistry.opacity.working);
  const out = await worker.computeEffectiveOpacity(
    transfer(copy, [copy.buffer]),
    width,
    height,
    project.adjustments.opacity,
  );
  if (seq !== requestSeq.opacity) return;
  mapRegistry.opacity.replaceEffective(out);
  mapRegistry.emitReplaced('opacity');
}

export async function smoothFloatMap(
  mapId: 'height' | 'opacity',
  radiusPx: number,
): Promise<void> {
  if (!mapRegistry.isAllocated) return;
  const { width, height } = mapRegistry;
  const worker = getImageWorker();
  const buf = mapRegistry.getMap(mapId);
  const workingCopy = new Float32Array(buf.working);

  const smoothed = await runTask(
    { labelKey: 'mapParams.taskSmoothing', labelParams: { map: mapId }, cancellable: false },
    async (ctx) =>
      worker.smoothFloatMap(
        transfer(workingCopy, [workingCopy.buffer]),
        width,
        height,
        radiusPx,
        proxy((p: number) => ctx.setProgress(p)),
      ),
  );

  buf.replaceWorking(smoothed);
  await recomputeEffectiveMap(mapId);
}

export interface FloatMapStats {
  min: number;
  max: number;
  mean: number;
}

export function computeFloatMapStats(mapId: 'height' | 'opacity'): FloatMapStats {
  if (!mapRegistry.isAllocated) {
    return { min: 0, max: 0, mean: 0 };
  }
  const effective = mapRegistry.getMap(mapId).effective;
  const len = effective.length;
  if (len === 0) return { min: 0, max: 0, mean: 0 };

  let minV = 1;
  let maxV = 0;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const v = effective[i] ?? 0;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    sum += v;
  }
  const meanV = sum / len;

  if (mapId === 'height') {
    const { minThicknessMm, maxThicknessMm } = useProjectStore.getState().project.canvas;
    return {
      min: valueToMm(minV, minThicknessMm, maxThicknessMm),
      max: valueToMm(maxV, minThicknessMm, maxThicknessMm),
      mean: valueToMm(meanV, minThicknessMm, maxThicknessMm),
    };
  }

  return {
    min: minV * 100,
    max: maxV * 100,
    mean: meanV * 100,
  };
}
