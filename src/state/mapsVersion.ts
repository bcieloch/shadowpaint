import { create } from 'zustand';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId } from '@/core/types';

export interface MapsVersionState {
  version: number;
  mapVersions: Record<MapId, number>;
  bump: (mapId: MapId | 'all') => void;
}

export const useMapsVersionStore = create<MapsVersionState>((set) => ({
  version: 0,
  mapVersions: { color: 0, height: 0, opacity: 0 },
  bump: (mapId) =>
    set((s) => {
      if (mapId === 'all') {
        return {
          version: s.version + 1,
          mapVersions: {
            color: s.mapVersions.color + 1,
            height: s.mapVersions.height + 1,
            opacity: s.mapVersions.opacity + 1,
          },
        };
      }
      return {
        version: s.version + 1,
        mapVersions: {
          ...s.mapVersions,
          [mapId]: s.mapVersions[mapId] + 1,
        },
      };
    }),
}));

mapRegistry.events.on('dirty', ({ mapId }) => {
  useMapsVersionStore.getState().bump(mapId);
});

mapRegistry.events.on('replaced', ({ mapId }) => {
  useMapsVersionStore.getState().bump(mapId);
});
