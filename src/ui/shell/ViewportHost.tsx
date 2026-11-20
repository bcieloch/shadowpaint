import { useEffect, useRef, useState } from 'react';
import { Maximize2, Scan } from 'lucide-react';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { MapId } from '@/core/types';
import { getCalibrationMetrics } from '@/core/units/calibration';
import { PointerRouter } from '@/editor2d/input/PointerRouter';
import { zoomAtPoint, type ViewportSize } from '@/editor2d/viewTransform';
import {
  recordTileHistory,
  redoGlobal,
  undoActiveMap,
  undoGlobal,
} from '@/services/historyService';
import { useEditorStore, type HeightDisplayMode, type ViewMode2D } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useEngine } from '@/ui/hooks/useEngine';
import { useI18n } from '@/ui/hooks/useI18n';
import { HeightLegend } from '@/ui/widgets/HeightLegend';
import { OpacityLegend } from '@/ui/widgets/OpacityLegend';

const CONTOUR_STEPS = [0.25, 0.5, 1, 2];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function getLockedWarningKey(mapId: MapId) {
  if (mapId === 'color') return 'maps.lockedWarningColor' as const;
  if (mapId === 'height') return 'maps.lockedWarningHeight' as const;
  return 'maps.lockedWarningOpacity' as const;
}

export function ViewportHost() {
  const { t } = useI18n();
  const canvas = useProjectStore((s) => s.project.canvas);
  const viewMode2D = useEditorStore((s) => s.viewMode2D);
  const heightDisplay = useEditorStore((s) => s.heightDisplay);
  const heightContourStepMm = useEditorStore((s) => s.heightContourStepMm);
  const pane2D = useEditorStore((s) => s.pane2D);
  const tool = useEditorStore((s) => s.tool);
  const brushSizeValue = useEditorStore((s) => s.brush.sizeValue);
  const brushSizeUnit = useEditorStore((s) => s.brush.sizeUnit);
  const setViewMode2D = useEditorStore((s) => s.setViewMode2D);
  const setHeightDisplay = useEditorStore((s) => s.setHeightDisplay);
  const setHeightContourStepMm = useEditorStore((s) => s.setHeightContourStepMm);

  const {
    containerRef,
    webglCanvasRef,
    overlayCanvasRef,
    viewportSize,
    fitView,
    setZoom100,
    setCursor,
  } = useEngine();

  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const viewportSizeRef = useRef<ViewportSize>(viewportSize);
  const pointerRouterRef = useRef<PointerRouter | null>(null);
  const statusClearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  // Attach PointerRouter to the 2D viewport container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const router = new PointerRouter({
      element: el,
      getViewportSize: () => viewportSizeRef.current,
      getEditor: () => useEditorStore.getState(),
      setPane2D: (pane) => useEditorStore.getState().setPane2D(pane),
      setCursor,
      onPanningChange: setIsPanning,
      toolContext: {
        registry: mapRegistry,
        getProject: () => useProjectStore.getState().project,
        getEditor: () => useEditorStore.getState(),
        setBrushOption: (key, value) => {
          useEditorStore.getState().setBrushOption(key, value);
        },
        onLockedMapAttempt: (mapId) => {
          useUiStore.getState().setStatusMessage({ key: getLockedWarningKey(mapId) });
          if (statusClearTimerRef.current !== null) {
            window.clearTimeout(statusClearTimerRef.current);
          }
          statusClearTimerRef.current = window.setTimeout(() => {
            useUiStore.getState().setStatusMessage(null);
            statusClearTimerRef.current = null;
          }, 4000);
        },
        recordMapTileEntry: recordTileHistory,
      },
    });
    pointerRouterRef.current = router;

    return () => {
      router.dispose();
      pointerRouterRef.current = null;
      if (statusClearTimerRef.current !== null) {
        window.clearTimeout(statusClearTimerRef.current);
        statusClearTimerRef.current = null;
      }
    };
  }, [containerRef, setCursor]);

  // Refresh overlay cursor ring when tool or brush size changes
  useEffect(() => {
    pointerRouterRef.current?.refreshCursor();
  }, [tool, brushSizeValue, brushSizeUnit]);

  // Non-passive wheel zoom anchored to cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const state = useEditorStore.getState();
      const projCanvas = useProjectStore.getState().project.canvas;
      const factor = Math.pow(2, -e.deltaY / 500);
      const next = zoomAtPoint(
        state.pane2D,
        { width: rect.width, height: rect.height },
        projCanvas.widthPx,
        projCanvas.heightPx,
        sx,
        sy,
        state.pane2D.zoom * factor,
      );
      state.setPane2D(next);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef]);

  // Keyboard shortcuts: Space pan, Ctrl+Z/Shift+Z/Y/Alt+Z history, Ctrl+0 fit, Ctrl+1 1:1, B/E/I/H, [/], 1/2/3
  useEffect(() => {
    const adjustBrushSize = (scale: number) => {
      const editor = useEditorStore.getState();
      const projCanvas = useProjectStore.getState().project.canvas;
      const pxPerCm = Math.max(0.001, getCalibrationMetrics(projCanvas).pxPerCm);
      const { sizeValue, sizeUnit } = editor.brush;

      if (sizeUnit === 'px') {
        const next = Math.max(
          1,
          Math.min(
            2000,
            scale > 1
              ? Math.max(sizeValue + 1, Math.round(sizeValue * scale))
              : Math.min(sizeValue - 1, Math.round(sizeValue * scale)),
          ),
        );
        editor.setBrushOption('sizeValue', next);
      } else {
        const minCm = Math.max(0.05, Number((1 / pxPerCm).toFixed(2)));
        const maxCm = Math.max(0.5, Number((2000 / pxPerCm).toFixed(2)));
        const next = Math.max(minCm, Math.min(maxCm, Number((sizeValue * scale).toFixed(2))));
        editor.setBrushOption('sizeValue', next);
      }
      pointerRouterRef.current?.refreshCursor();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
        pointerRouterRef.current?.setSpacePressed(true);
        pointerRouterRef.current?.refreshCursor();
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const lower = e.key.toLowerCase();
        if (e.altKey && !e.shiftKey && lower === 'z') {
          e.preventDefault();
          undoActiveMap();
        } else if (!e.altKey && e.shiftKey && lower === 'z') {
          e.preventDefault();
          redoGlobal();
        } else if (!e.altKey && !e.shiftKey && lower === 'y') {
          e.preventDefault();
          redoGlobal();
        } else if (!e.altKey && !e.shiftKey && lower === 'z') {
          e.preventDefault();
          undoGlobal();
        } else if (e.key === '0') {
          e.preventDefault();
          fitView();
        } else if (e.key === '1') {
          e.preventDefault();
          setZoom100();
        }
        return;
      }

      if (e.altKey) return;

      const lower = e.key.toLowerCase();
      const editor = useEditorStore.getState();

      if (lower === 'b') {
        editor.setTool('brush');
      } else if (lower === 'e') {
        editor.setTool('eraser');
      } else if (lower === 'i') {
        editor.setTool('eyedropper');
      } else if (lower === 'h') {
        editor.setTool('pan');
      } else if (e.key === '[') {
        e.preventDefault();
        adjustBrushSize(1 / 1.18);
      } else if (e.key === ']') {
        e.preventDefault();
        adjustBrushSize(1.18);
      } else if (e.key === '1') {
        editor.setActiveMap('color');
      } else if (e.key === '2') {
        editor.setActiveMap('height');
      } else if (e.key === '3') {
        editor.setActiveMap('opacity');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
        pointerRouterRef.current?.setSpacePressed(false);
        pointerRouterRef.current?.refreshCursor();
      }
    };

    const onBlur = () => {
      setSpacePressed(false);
      setIsPanning(false);
      pointerRouterRef.current?.setSpacePressed(false);
      pointerRouterRef.current?.cancelActive();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [fitView, setZoom100]);

  const activeFlatMode: 'color' | 'height' | 'opacity' =
    viewMode2D === 'height' || viewMode2D === 'opacity' ? viewMode2D : 'color';

  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : spacePressed || tool === 'pan'
      ? 'cursor-grab'
      : 'cursor-crosshair';

  return (
    <section
      aria-label={t('shell.viewportTitle')}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#121214]"
    >
      <div className="border-border bg-card/70 flex h-9 shrink-0 items-center justify-between gap-2 border-b px-2.5">
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={activeFlatMode}
            onValueChange={(value) => {
              if (value === 'color' || value === 'height' || value === 'opacity') {
                setViewMode2D(value as ViewMode2D);
              }
            }}
          >
            <ToggleGroupItem value="color" data-testid="mode-color" className="h-7 px-2.5 text-xs">
              {t('viewport.modeColor')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="height"
              data-testid="mode-height"
              className="h-7 px-2.5 text-xs"
            >
              {t('viewport.modeHeight')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="opacity"
              data-testid="mode-opacity"
              className="h-7 px-2.5 text-xs"
            >
              {t('viewport.modeOpacity')}
            </ToggleGroupItem>
          </ToggleGroup>

          {activeFlatMode === 'height' && (
            <div className="flex items-center gap-1.5">
              <Select
                value={heightDisplay}
                onValueChange={(v) => setHeightDisplay(v as HeightDisplayMode)}
              >
                <SelectTrigger
                  size="sm"
                  data-testid="height-display-select"
                  aria-label={t('viewport.heightDisplayLabel')}
                  className="h-7 w-40 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gray">{t('viewport.heightDisplayGray')}</SelectItem>
                  <SelectItem value="heat">{t('viewport.heightDisplayHeat')}</SelectItem>
                  <SelectItem value="topo">{t('viewport.heightDisplayTopo')}</SelectItem>
                </SelectContent>
              </Select>

              {heightDisplay === 'topo' && (
                <Select
                  value={String(heightContourStepMm)}
                  onValueChange={(v) => setHeightContourStepMm(Number(v))}
                >
                  <SelectTrigger
                    size="sm"
                    data-testid="contour-step-select"
                    aria-label={t('viewport.contourStep')}
                    className="h-7 w-24 font-mono text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTOUR_STEPS.map((step) => (
                      <SelectItem key={step} value={String(step)}>
                        {step} mm
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span
            data-testid="viewport-zoom-pct"
            className="text-muted-foreground mr-1 min-w-12 text-right font-mono text-xs"
          >
            {Math.round(pane2D.zoom * 100)}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                data-testid="btn-zoom-fit"
                onClick={fitView}
                className="gap-1 text-xs"
              >
                <Maximize2 className="size-3.5" />
                {t('viewport.zoomFit')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('viewport.zoomFitTooltip')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                data-testid="btn-zoom-100"
                onClick={setZoom100}
                className="gap-1 font-mono text-xs"
              >
                <Scan className="size-3.5" />
                {t('viewport.zoom100')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('viewport.zoom100Tooltip')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        ref={containerRef}
        data-testid="viewport-canvas-area"
        className={`relative min-h-0 flex-1 overflow-hidden bg-[#121214] select-none ${cursorClass}`}
      >
        <canvas
          ref={webglCanvasRef}
          data-testid="viewport-webgl-canvas"
          className="absolute inset-0 block h-full w-full"
        />
        <canvas
          ref={overlayCanvasRef}
          data-testid="viewport-overlay-canvas"
          className="pointer-events-none absolute inset-0 block h-full w-full"
        />

        <div className="pointer-events-none absolute right-3 bottom-3 flex flex-col gap-2">
          {activeFlatMode === 'height' && (
            <HeightLegend
              mode={heightDisplay}
              minMm={canvas.minThicknessMm}
              maxMm={canvas.maxThicknessMm}
            />
          )}
          {activeFlatMode === 'opacity' && <OpacityLegend />}
        </div>
      </div>
    </section>
  );
}
