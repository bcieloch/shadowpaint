import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Merge,
  Plus,
  Trash2,
  Undo2,
  Unlock,
} from 'lucide-react';
import { LAYER_BLEND_MODES, type LayerBlendMode, type MapLayer } from '@/core/maps/MapBuffer';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId } from '@/core/types';
import { formatHistoryMeta, undoMap } from '@/services/historyService';
import {
  addLayerToMap,
  clearLayerOnMap,
  deleteLayerFromMap,
  duplicateLayerOnMap,
  flattenMapLayers,
  mergeLayerDownOnMap,
  moveLayerOnMap,
  selectLayerOnMap,
  updateLayerPropsOnMap,
} from '@/services/layerService';
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

const BLEND_MODE_LABEL_KEY: Record<
  LayerBlendMode,
  | 'maps.blendNormal'
  | 'maps.blendAdd'
  | 'maps.blendSubtract'
  | 'maps.blendMultiply'
  | 'maps.blendMax'
  | 'maps.blendMin'
> = {
  normal: 'maps.blendNormal',
  add: 'maps.blendAdd',
  subtract: 'maps.blendSubtract',
  multiply: 'maps.blendMultiply',
  max: 'maps.blendMax',
  min: 'maps.blendMin',
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

function LayerThumbnail({ mapId, layerId }: { mapId: MapId; layerId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const version = useMapsVersionStore((s) => s.mapVersions[mapId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapRegistry.isAllocated) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const layer = mapRegistry.getMap(mapId).getLayerById(layerId);
    if (!layer) return;

    const w = canvas.width;
    const h = canvas.height;
    const srcW = mapRegistry.width;
    const srcH = mapRegistry.height;
    const img = ctx.createImageData(w, h);
    const dst = img.data;
    const mask = layer.mask;

    if (mapId === 'color') {
      const src = layer.data as Uint8ClampedArray;
      for (let y = 0; y < h; y++) {
        const sy = Math.min(srcH - 1, Math.floor((y * srcH) / h));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(srcW - 1, Math.floor((x * srcW) / w));
          const pxIdx = sy * srcW + sx;
          const cov = (mask[pxIdx] ?? 0) / 255;
          const checker = ((x >> 2) + (y >> 2)) & 1 ? 56 : 36;
          const si = pxIdx * 4;
          const di = (y * w + x) * 4;
          dst[di] = Math.round(checker + ((src[si] ?? 0) - checker) * cov);
          dst[di + 1] = Math.round(checker + ((src[si + 1] ?? 0) - checker) * cov);
          dst[di + 2] = Math.round(checker + ((src[si + 2] ?? 0) - checker) * cov);
          dst[di + 3] = 255;
        }
      }
    } else {
      const src = layer.data as Float32Array;
      for (let y = 0; y < h; y++) {
        const sy = Math.min(srcH - 1, Math.floor((y * srcH) / h));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(srcW - 1, Math.floor((x * srcW) / w));
          const pxIdx = sy * srcW + sx;
          const cov = (mask[pxIdx] ?? 0) / 255;
          const checker = ((x >> 2) + (y >> 2)) & 1 ? 56 : 36;
          const v = Math.round((src[pxIdx] ?? 0) * 255);
          const out = Math.round(checker + (v - checker) * cov);
          const di = (y * w + x) * 4;
          dst[di] = out;
          dst[di + 1] = out;
          dst[di + 2] = out;
          dst[di + 3] = 255;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
  }, [mapId, layerId, version]);

  return (
    <canvas
      ref={canvasRef}
      width={22}
      height={22}
      className="border-border size-5.5 shrink-0 rounded border bg-black object-cover"
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
  useMapsVersionStore((s) => s.mapVersions[activeMap]);

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const toggleLock = (id: MapId) => {
    const nextLocked = !maps[id].locked;
    updateProject((draft) => {
      draft.maps[id].locked = nextLocked;
    });
    if (!nextLocked) {
      setStatusMessage(null);
    }
  };

  const activeMapLocked = maps[activeMap].locked;
  const activeMapShort = t(`maps.${activeMap}Short` as const);
  const activeBuf = mapRegistry.isAllocated ? mapRegistry.getMap(activeMap) : null;
  const layers: readonly MapLayer[] = activeBuf ? activeBuf.layers : [];
  const activeLayer = activeBuf ? activeBuf.activeLayer : null;
  const activeLayerIndex = activeBuf ? activeBuf.activeLayerIndex : 0;

  const commitRename = (layerId: string) => {
    const trimmed = editingName.trim();
    if (trimmed.length > 0) {
      updateLayerPropsOnMap(activeMap, layerId, { name: trimmed });
    }
    setEditingLayerId(null);
  };

  return (
    <section className="border-border space-y-2.5 border-b p-3">
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
          const layerCount = mapRegistry.isAllocated ? mapRegistry.getMap(id).layers.length : 1;
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
                    className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <MapThumbnail mapId={id} />
                    <span className="flex-1 truncate font-medium">{mapName}</span>
                    {layerCount > 1 && (
                      <span
                        data-testid={`map-layer-count-${id}`}
                        className="border-primary/30 bg-primary/15 text-primary rounded border px-1 py-0.25 font-mono text-[10px] font-semibold"
                      >
                        {t('maps.layerCountBadge', { count: layerCount })}
                      </span>
                    )}
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

      {/* Active Map Layers Stack */}
      {activeBuf && activeLayer && (
        <div
          data-testid="active-map-layers-panel"
          className="border-border/80 bg-background/40 space-y-2 rounded-md border p-2"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase">
              <Layers className="text-primary size-3" />
              {t('maps.layersTitle', { map: activeMapShort })}
            </span>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={activeMapLocked}
                    aria-label={t('maps.addLayer')}
                    data-testid="layer-add"
                    onClick={() => addLayerToMap(activeMap)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('maps.addLayerTooltip')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={activeMapLocked}
                    aria-label={t('maps.duplicateLayer')}
                    data-testid="layer-duplicate"
                    onClick={() => duplicateLayerOnMap(activeMap)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('maps.duplicateLayerTooltip')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={activeMapLocked || activeLayerIndex <= 0}
                      aria-label={t('maps.mergeDown')}
                      data-testid="layer-merge-down"
                      onClick={() => mergeLayerDownOnMap(activeMap)}
                    >
                      <Merge className="size-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t('maps.mergeDownTooltip')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={activeMapLocked || activeLayer.locked}
                      aria-label={t('maps.clearLayer')}
                      data-testid="layer-clear"
                      onClick={() => clearLayerOnMap(activeMap)}
                    >
                      <Eraser className="size-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t('maps.clearLayerTooltip')}</TooltipContent>
              </Tooltip>

              {layers.length > 1 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={activeMapLocked}
                      data-testid="layer-flatten"
                      onClick={() => flattenMapLayers(activeMap)}
                      className="h-6 px-1.5 text-[10px]"
                    >
                      {t('maps.flattenLayers')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('maps.flattenLayersTooltip')}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Active layer Blend Mode & Opacity */}
          <div className="grid grid-cols-2 items-center gap-1.5 text-[11px]">
            <label className="flex items-center gap-1">
              <span className="text-muted-foreground shrink-0 text-[10px]">
                {t('maps.blendMode')}
              </span>
              <select
                aria-label={t('maps.blendMode')}
                data-testid="layer-blend-mode"
                disabled={activeMapLocked || activeLayer.locked}
                value={activeLayer.blendMode}
                onChange={(e) =>
                  updateLayerPropsOnMap(activeMap, activeLayer.id, {
                    blendMode: e.target.value as LayerBlendMode,
                  })
                }
                className="border-input bg-background text-foreground focus-visible:ring-ring h-6 min-w-0 flex-1 rounded border px-1.5 text-[11px] focus-visible:ring-1 focus-visible:outline-none disabled:opacity-50"
              >
                {LAYER_BLEND_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(BLEND_MODE_LABEL_KEY[mode])}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1">
              <span className="text-muted-foreground shrink-0 text-[10px]">
                {t('maps.layerOpacity')}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                aria-label={t('maps.layerOpacity')}
                data-testid="layer-opacity-input"
                disabled={activeMapLocked || activeLayer.locked}
                value={Math.round(activeLayer.opacity * 100)}
                onChange={(e) =>
                  updateLayerPropsOnMap(activeMap, activeLayer.id, {
                    opacity: Number(e.target.value) / 100,
                  })
                }
                className="accent-primary h-1.5 min-w-0 flex-1 cursor-pointer"
              />
              <span className="w-7 text-right font-mono text-[10px] tabular-nums">
                {Math.round(activeLayer.opacity * 100)}%
              </span>
            </label>
          </div>

          {/* Layer stack rows (top layer rendered first) */}
          <div className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
            {[...layers].reverse().map((layer, revIdx) => {
              const idx = layers.length - 1 - revIdx;
              const isSelected = layer.id === activeLayer.id;
              const isBase = idx === 0;
              const canMoveUp = idx < layers.length - 1;
              const canMoveDown = idx > 0;

              return (
                <div
                  key={layer.id}
                  data-testid={`layer-row-${layer.id}`}
                  className={`flex items-center gap-1 rounded border px-1.5 py-1 text-xs transition-colors ${
                    isSelected
                      ? 'border-primary/80 bg-primary/15 text-foreground'
                      : 'border-border/70 bg-background/60 text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={layer.visible ? t('maps.hideLayer') : t('maps.showLayer')}
                    data-testid={`layer-visibility-${layer.id}`}
                    disabled={activeMapLocked}
                    onClick={() =>
                      updateLayerPropsOnMap(activeMap, layer.id, {
                        visible: !layer.visible,
                      })
                    }
                    className={`rounded p-0.5 transition-colors ${
                      layer.visible
                        ? 'text-foreground hover:text-primary'
                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                    }`}
                  >
                    {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>

                  {editingLayerId === layer.id ? (
                    <input
                      type="text"
                      autoFocus
                      data-testid={`layer-rename-input-${layer.id}`}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => commitRename(layer.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename(layer.id);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingLayerId(null);
                        }
                      }}
                      className="border-primary bg-background text-foreground h-5 min-w-0 flex-1 rounded border px-1 text-[11px] focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid={`layer-select-${layer.id}`}
                      aria-pressed={isSelected}
                      onClick={() => selectLayerOnMap(activeMap, layer.id)}
                      onDoubleClick={() => {
                        if (activeMapLocked || layer.locked) return;
                        setEditingLayerId(layer.id);
                        setEditingName(layer.name);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none"
                    >
                      <LayerThumbnail mapId={activeMap} layerId={layer.id} />
                      <span className="truncate text-[11px] font-medium">{layer.name}</span>
                      {isBase && (
                        <span className="border-border/80 bg-muted/60 text-muted-foreground shrink-0 rounded border px-1 py-0.25 text-[9px]">
                          {t('maps.baseLayerBadge')}
                        </span>
                      )}
                      {layer.blendMode !== 'normal' && (
                        <span className="bg-primary/15 text-primary shrink-0 rounded px-1 py-0.25 font-mono text-[9px] uppercase">
                          {layer.blendMode}
                        </span>
                      )}
                    </button>
                  )}

                  {layers.length > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={activeMapLocked || !canMoveUp}
                        aria-label={t('maps.moveLayerUp')}
                        data-testid={`layer-move-up-${layer.id}`}
                        onClick={() => moveLayerOnMap(activeMap, layer.id, 'up')}
                        className="text-muted-foreground hover:text-foreground rounded p-0.5 disabled:opacity-30"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        disabled={activeMapLocked || !canMoveDown}
                        aria-label={t('maps.moveLayerDown')}
                        data-testid={`layer-move-down-${layer.id}`}
                        onClick={() => moveLayerOnMap(activeMap, layer.id, 'down')}
                        className="text-muted-foreground hover:text-foreground rounded p-0.5 disabled:opacity-30"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    disabled={activeMapLocked}
                    aria-label={layer.locked ? t('maps.unlockLayer') : t('maps.lockLayer')}
                    aria-pressed={layer.locked}
                    data-testid={`layer-lock-${layer.id}`}
                    onClick={() =>
                      updateLayerPropsOnMap(activeMap, layer.id, {
                        locked: !layer.locked,
                      })
                    }
                    className={`rounded p-0.5 ${
                      layer.locked
                        ? 'text-amber-400'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {layer.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                  </button>

                  {layers.length > 1 && (
                    <button
                      type="button"
                      disabled={activeMapLocked || layer.locked}
                      aria-label={t('maps.deleteLayer')}
                      data-testid={`layer-delete-${layer.id}`}
                      onClick={() => deleteLayerFromMap(activeMap, layer.id)}
                      className="text-muted-foreground hover:text-destructive rounded p-0.5 disabled:opacity-30"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
