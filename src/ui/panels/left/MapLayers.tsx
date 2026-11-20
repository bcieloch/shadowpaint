import { useEffect, useRef } from 'react';
import { Lock, Undo2, Unlock } from 'lucide-react';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId } from '@/core/types';
import { formatHistoryMeta, undoMap } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import { useHistoryStore } from '@/state/historyStore';
import { useMapsVersionStore } from '@/state/mapsVersion';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';

const MAP_SHORTCUT_KEY: Record<MapId, string> = {
  color: '1',
  height: '2',
  opacity: '3',
};

function MapThumbnail({ mapId }: { mapId: MapId }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const version = useMapsVersionStore((s) => s.mapVersions[mapId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapRegistry.isAllocated) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const srcW = mapRegistry.width;
    const srcH = mapRegistry.height;
    const img = ctx.createImageData(w, h);
    const dst = img.data;

    if (mapId === 'color') {
      const src = mapRegistry.color.effective;
      for (let y = 0; y < h; y++) {
        const sy = Math.min(srcH - 1, Math.floor((y * srcH) / h));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(srcW - 1, Math.floor((x * srcW) / w));
          const si = (sy * srcW + sx) * 4;
          const di = (y * w + x) * 4;
          dst[di] = src[si] ?? 0;
          dst[di + 1] = src[si + 1] ?? 0;
          dst[di + 2] = src[si + 2] ?? 0;
          dst[di + 3] = 255;
        }
      }
    } else {
      const src = mapRegistry.getMap(mapId).effective as Float32Array;
      for (let y = 0; y < h; y++) {
        const sy = Math.min(srcH - 1, Math.floor((y * srcH) / h));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(srcW - 1, Math.floor((x * srcW) / w));
          const v = Math.round((src[sy * srcW + sx] ?? 0) * 255);
          const di = (y * w + x) * 4;
          dst[di] = v;
          dst[di + 1] = v;
          dst[di + 2] = v;
          dst[di + 3] = 255;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
  }, [mapId, version]);

  return (
    <canvas
      ref={canvasRef}
      width={28}
      height={28}
      className="border-border size-7 shrink-0 rounded border bg-black object-cover"
    />
  );
}

export function MapLayers() {
  const { t } = useI18n();
  const activeMap = useEditorStore((s) => s.activeMap);
  const setActiveMap = useEditorStore((s) => s.setActiveMap);
  const maps = useProjectStore((s) => s.project.maps);
  const updateProject = useProjectStore((s) => s.updateProject);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const stacks = useHistoryStore((s) => s.stacks);

  const toggleLock = (id: MapId) => {
    const nextLocked = !maps[id].locked;
    updateProject((draft) => {
      draft.maps[id].locked = nextLocked;
    });
    if (!nextLocked) {
      setStatusMessage(null);
    }
  };

  return (
    <section className="border-border space-y-2 border-b p-3">
      <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {t('maps.sectionTitle')}
      </h2>
      <div className="space-y-1">
        {(['color', 'height', 'opacity'] as const).map((id) => {
          const selected = activeMap === id;
          const locked = maps[id].locked;
          const mapName = t(`maps.${id}` as const);
          const mapUndoStack = stacks[id].undo;
          const mapUndoTop = mapUndoStack[mapUndoStack.length - 1] ?? null;
          const undoMapTooltip = mapUndoTop
            ? t('maps.undoMap', {
                map: mapName,
                action: formatHistoryMeta(mapUndoTop.meta, t),
              })
            : t('maps.undoMapEmpty', { map: mapName });
          const selectTooltip = t('maps.selectMapTooltip', {
            map: mapName,
            key: MAP_SHORTCUT_KEY[id],
          });

          return (
            <div
              key={id}
              className={`flex items-center gap-1 rounded border pr-1 text-xs transition-colors ${
                selected
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border bg-background/50 text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setActiveMap(id)}
                    aria-pressed={selected}
                    data-testid={`map-layer-${id}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MapThumbnail mapId={id} />
                    <span className="flex-1 truncate font-medium">{mapName}</span>
                    {locked && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        {t('maps.lockedBadge')}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{selectTooltip}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={!mapUndoTop}
                      aria-label={undoMapTooltip}
                      data-testid={`map-undo-${id}`}
                      onClick={() => undoMap(id)}
                      className="text-muted-foreground"
                    >
                      <Undo2 className="size-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{undoMapTooltip}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant={locked ? 'secondary' : 'ghost'}
                    aria-pressed={locked}
                    aria-label={
                      locked
                        ? t('maps.unlockMap', { map: mapName })
                        : t('maps.lockMap', { map: mapName })
                    }
                    data-testid={`map-lock-${id}`}
                    onClick={() => toggleLock(id)}
                    className={locked ? 'text-amber-400' : 'text-muted-foreground'}
                  >
                    {locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {locked
                    ? t('maps.unlockMap', { map: mapName })
                    : t('maps.lockMap', { map: mapName })}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </section>
  );
}
