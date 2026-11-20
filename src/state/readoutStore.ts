import { create } from 'zustand';
import { ensureEffectiveRect } from '@/core/maps/dirtyTiles';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { type CursorReadout, sampleCursorReadout } from '@/core/optics/cursorReadout';
import type { Vec2 } from '@/core/types';
import { useProjectStore } from '@/state/projectStore';

export interface ReadoutState {
  cursorImagePos: Vec2 | null;
  readout: CursorReadout | null;
  setReadoutState: (cursorImagePos: Vec2 | null, readout: CursorReadout | null) => void;
}

export const useReadoutStore = create<ReadoutState>()((set) => ({
  cursorImagePos: null,
  readout: null,
  setReadoutState: (cursorImagePos, readout) => set({ cursorImagePos, readout }),
}));

let rafHandle: number | null = null;
let pendingPos: Vec2 | null | undefined;

function computeAndApply(imagePos: Vec2 | null): void {
  if (!imagePos || !mapRegistry.isAllocated) {
    useReadoutStore.getState().setReadoutState(null, null);
    return;
  }
  const project = useProjectStore.getState().project;
  if (mapRegistry.dirtyTiles.hasDirty()) {
    const px = Math.floor(imagePos.x);
    const py = Math.floor(imagePos.y);
    if (px >= 0 && py >= 0 && px < mapRegistry.width && py < mapRegistry.height) {
      const rect = { x: px, y: py, w: 1, h: 1 };
      ensureEffectiveRect(mapRegistry, 'color', rect, project.adjustments);
      ensureEffectiveRect(mapRegistry, 'height', rect, project.adjustments);
      ensureEffectiveRect(mapRegistry, 'opacity', rect, project.adjustments);
    }
  }
  const readout = sampleCursorReadout({
    imageX: imagePos.x,
    imageY: imagePos.y,
    width: mapRegistry.width,
    height: mapRegistry.height,
    colorEffective: mapRegistry.color.effective,
    heightEffective: mapRegistry.heightMap.effective,
    opacityEffective: mapRegistry.opacity.effective,
    canvas: project.canvas,
    material: project.material,
    back: project.lighting.back,
  });
  useReadoutStore.getState().setReadoutState(imagePos, readout);
}

export function scheduleCursorReadout(imagePos: Vec2 | null): void {
  pendingPos = imagePos ? { x: imagePos.x, y: imagePos.y } : null;
  if (typeof requestAnimationFrame !== 'function') {
    const next = pendingPos;
    pendingPos = undefined;
    computeAndApply(next);
    return;
  }
  if (rafHandle !== null) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null;
    if (pendingPos === undefined) return;
    const next = pendingPos;
    pendingPos = undefined;
    computeAndApply(next);
  });
}

export function refreshCursorReadout(): void {
  const target = pendingPos !== undefined ? pendingPos : useReadoutStore.getState().cursorImagePos;
  if (target) {
    scheduleCursorReadout(target);
  }
}

export function clearCursorReadout(): void {
  if (rafHandle !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafHandle);
  }
  rafHandle = null;
  pendingPos = undefined;
  useReadoutStore.getState().setReadoutState(null, null);
}
