import { useEffect, useRef, useState } from 'react';
import { Maximize2, Scan } from 'lucide-react';
import { screenToImagePx, zoomAtPoint } from '@/editor2d/viewTransform';
import {
  useEditorStore,
  type HeightDisplayMode,
  type ViewMode2D,
} from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
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

export function ViewportHost() {
  const { t } = useI18n();
  const canvas = useProjectStore((s) => s.project.canvas);
  const viewMode2D = useEditorStore((s) => s.viewMode2D);
  const heightDisplay = useEditorStore((s) => s.heightDisplay);
  const heightContourStepMm = useEditorStore((s) => s.heightContourStepMm);
  const pane2D = useEditorStore((s) => s.pane2D);
  const setViewMode2D = useEditorStore((s) => s.setViewMode2D);
  const setHeightDisplay = useEditorStore((s) => s.setHeightDisplay);
  const setHeightContourStepMm = useEditorStore((s) => s.setHeightContourStepMm);
  const setPane2D = useEditorStore((s) => s.setPane2D);

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
  const panDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

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

  // Basic viewport keyboard shortcuts: Space pan, Ctrl+0 fit, Ctrl+1 1:1
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '0') {
          e.preventDefault();
          fitView();
        } else if (e.key === '1') {
          e.preventDefault();
          setZoom100();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    const onBlur = () => {
      setSpacePressed(false);
      setIsPanning(false);
      panDragRef.current = null;
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const isMiddle = e.button === 1;
    const isSpaceLeft = spacePressed && e.button === 0;
    if (!isMiddle && !isSpaceLeft) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { pane2D: currentPane } = useEditorStore.getState();
    panDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: currentPane.panX,
      startPanY: currentPane.panY,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (panDragRef.current && panDragRef.current.pointerId === e.pointerId) {
      const dx = e.clientX - panDragRef.current.startClientX;
      const dy = e.clientY - panDragRef.current.startClientY;
      setPane2D({
        panX: panDragRef.current.startPanX + dx,
        panY: panDragRef.current.startPanY + dy,
      });
    }

    const currentPane = useEditorStore.getState().pane2D;
    const imgPos = screenToImagePx(
      currentPane,
      viewportSize,
      canvas.widthPx,
      canvas.heightPx,
      sx,
      sy,
    );
    setCursor({
      screenPos: { x: sx, y: sy },
      imagePos: imgPos,
    });
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panDragRef.current && panDragRef.current.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      panDragRef.current = null;
      setIsPanning(false);
    }
  };

  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : spacePressed
      ? 'cursor-grab'
      : 'cursor-crosshair';

  return (
    <section
      aria-label={t('shell.viewportTitle')}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#121214]"
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/70 px-2.5">
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
            <ToggleGroupItem
              value="color"
              data-testid="mode-color"
              className="h-7 px-2.5 text-xs"
            >
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
            className="mr-1 min-w-12 text-right font-mono text-xs text-muted-foreground"
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        onPointerLeave={() => setCursor(null)}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
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
