import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { Vec2 } from '@/core/types';
import { OverlayRenderer, type OverlayCursorState } from '@/editor2d/overlay/OverlayRenderer';
import { computeSplitPanes } from '@/editor2d/splitLayout';
import { fitToViewport, zoom100, type ViewportSize } from '@/editor2d/viewTransform';
import { Engine } from '@/engine3d/Engine';
import { detectWebGL2Support } from '@/lib/webgl';
import { setExportPreviewRenderer } from '@/services/exportService';
import { ensureInitialProjectAllocated } from '@/services/projectService';
import { useEditorStore } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { clearCursorReadout, refreshCursorReadout } from '@/state/readoutStore';
import { useI18n } from '@/ui/hooks/useI18n';

export interface UseEngineResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  webglCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewportSize: ViewportSize;
  fitView: () => void;
  setZoom100: () => void;
  resetView3D: () => void;
  setCursor: (cursor: OverlayCursorState | null) => void;
  setCursorImagePos: (pos: Vec2 | null) => void;
  raycast3DCanvasPx: (clientX: number, clientY: number) => Vec2 | null;
}

function resolvePane2DSize(totalViewport: ViewportSize): ViewportSize {
  const { layout, splitRatio } = useEditorStore.getState();
  if (layout === 'split') {
    const { leftPane } = computeSplitPanes(totalViewport.width, totalViewport.height, splitRatio);
    return { width: leftPane.width, height: leftPane.height };
  }
  return totalViewport;
}

export function useEngine(): UseEngineResult {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const overlayRef = useRef<OverlayRenderer | null>(null);
  const cursorRef = useRef<OverlayCursorState | null>(null);
  const viewportSizeRef = useRef<ViewportSize>({ width: 1, height: 1 });
  const overlaySizeRef = useRef<ViewportSize>({ width: 0, height: 0 });
  const didInitialFitRef = useRef(false);
  const lastDimsRef = useRef<{ widthPx: number; heightPx: number } | null>(null);
  const antsRafRef = useRef<number | null>(null);
  const antsPhaseRef = useRef(0);

  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 1, height: 1 });

  const renderOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const { canvas, grid } = useProjectStore.getState().project;
    const {
      layout,
      pane2D,
      viewMode2D,
      showMaskOverlay,
      showRulers,
      rulerLine,
      crossSectionLine,
      crossSectionHoverT,
      tool,
    } = useEditorStore.getState();
    if (layout === '3d') {
      overlay.clear();
      return;
    }

    const paneVp = resolvePane2DSize(viewportSizeRef.current);
    if (
      overlaySizeRef.current.width !== paneVp.width ||
      overlaySizeRef.current.height !== paneVp.height
    ) {
      overlaySizeRef.current = paneVp;
      overlay.resize(paneVp.width, paneVp.height);
    }

    const isLit2D = viewMode2D === 'front' || viewMode2D === 'back' || viewMode2D === 'combined';
    overlay.render({
      viewport: paneVp,
      imageWidth: canvas.widthPx,
      imageHeight: canvas.heightPx,
      canvasWidthCm: canvas.widthCm,
      canvasHeightCm: canvas.heightCm,
      transform: pane2D,
      cursor: cursorRef.current,
      grid,
      showRulers,
      rulerLine,
      isRulerToolActive: tool === 'ruler',
      crossSectionLine,
      crossSectionHoverT,
      isCrossSectionToolActive: tool === 'crossSection',
      selectionMask: mapRegistry.isAllocated ? mapRegistry.selection : null,
      hasSelection: mapRegistry.hasSelection,
      marchingAntsPhasePx: antsPhaseRef.current,
      tintRedOverlay: showMaskOverlay && isLit2D,
    });
  }, []);

  const syncAntsAnimation = useCallback(() => {
    const { layout } = useEditorStore.getState();
    const shouldAnimate = mapRegistry.hasSelection && layout !== '3d';
    if (!shouldAnimate) {
      if (antsRafRef.current !== null) {
        cancelAnimationFrame(antsRafRef.current);
        antsRafRef.current = null;
      }
      return;
    }
    if (antsRafRef.current !== null) return;

    let lastTick = performance.now();
    const step = (now: number) => {
      const editorNow = useEditorStore.getState();
      if (!mapRegistry.hasSelection || editorNow.layout === '3d') {
        antsRafRef.current = null;
        return;
      }
      if (now - lastTick >= 65) {
        antsPhaseRef.current = (antsPhaseRef.current + 1) % 8;
        lastTick = now;
        renderOverlay();
      }
      antsRafRef.current = requestAnimationFrame(step);
    };
    antsRafRef.current = requestAnimationFrame(step);
  }, [renderOverlay]);

  const syncEngineParams = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const project = useProjectStore.getState().project;
    const editor = useEditorStore.getState();
    engine.setRenderParams({
      layout: editor.layout,
      canvas: project.canvas,
      material: project.material,
      lighting: project.lighting,
      view3d: project.view3d,
      grid: project.grid,
      viewMode2D: editor.viewMode2D,
      view3DLighting: editor.view3DLighting,
      splitRatio: editor.splitRatio,
      heightDisplay: editor.heightDisplay,
      contourStepMm: editor.heightContourStepMm,
      showLampGizmos: editor.showLampGizmos,
      showMaskOverlay: editor.showMaskOverlay,
      pane2D: editor.pane2D,
      crossSectionLine: editor.crossSectionLine,
      crossSectionHoverT: editor.crossSectionHoverT,
    });
    renderOverlay();
    syncAntsAnimation();
  }, [renderOverlay, syncAntsAnimation]);

  const fitView = useCallback(() => {
    const { canvas } = useProjectStore.getState().project;
    const vp = resolvePane2DSize(viewportSizeRef.current);
    if (vp.width <= 1 || vp.height <= 1) return;
    useEditorStore.getState().setPane2D(fitToViewport(vp, canvas.widthPx, canvas.heightPx));
  }, []);

  const setZoom100 = useCallback(() => {
    const vp = resolvePane2DSize(viewportSizeRef.current);
    useEditorStore.getState().setPane2D(zoom100(vp));
  }, []);

  const resetView3D = useCallback(() => {
    engineRef.current?.resetView3D();
  }, []);

  const setCursor = useCallback(
    (cursor: OverlayCursorState | null) => {
      cursorRef.current = cursor;
      renderOverlay();
    },
    [renderOverlay],
  );

  const setCursorImagePos = useCallback((pos: Vec2 | null) => {
    engineRef.current?.setCursorImagePos(pos);
  }, []);

  const raycast3DCanvasPx = useCallback((clientX: number, clientY: number): Vec2 | null => {
    const engine = engineRef.current;
    const container = containerRef.current;
    if (!engine || !container) return null;
    return engine.raycast3DCanvasPx(clientX, clientY, container.getBoundingClientRect());
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const webglCanvas = webglCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!container || !webglCanvas || !overlayCanvas) return;

    ensureInitialProjectAllocated();

    const overlay = new OverlayRenderer(overlayCanvas);
    overlayRef.current = overlay;

    let engine: Engine | null = null;
    if (detectWebGL2Support()) {
      engine = new Engine(webglCanvas, mapRegistry, {
        onContextLost: () => {
          toast.warning(t('viewport.contextLost'));
        },
        onContextRestored: () => {
          toast.success(t('viewport.contextRestored'));
        },
        onError: (err) => {
          toast.error(t('viewport.renderError', { message: err.message }));
        },
      });
      engineRef.current = engine;
      setExportPreviewRenderer(
        (mode, longestSide) => engine?.renderPreview(mode, longestSide) ?? null,
      );

      window.__shadowpaintDebug = {
        getMemoryInfo: () => engine?.getMemoryInfo() ?? { geometries: 0, textures: 0, programs: 0 },
        getBuiltDimensions: () =>
          engine?.getBuiltDimensions() ?? { widthPx: 0, heightPx: 0, widthCm: 0, heightCm: 0 },
        get3DStats: () => engine?.get3DStats() ?? null,
        getFrontLightStats: () => engine?.getFrontLightStats() ?? null,
        getBackLightStats: () => engine?.getBackLightStats() ?? null,
        getCrossSection3DStats: () => engine?.getCrossSection3DStats() ?? null,
        getCursor3DStats: () => engine?.getCursor3DStats() ?? null,
        getSelectionStats: () => {
          let selectedPixels = 0;
          if (mapRegistry.isAllocated) {
            const mask = mapRegistry.selection;
            for (let i = 0; i < mask.length; i++) {
              if ((mask[i] ?? 0) > 0) selectedPixels++;
            }
          }
          return {
            hasSelection: mapRegistry.hasSelection,
            selectedPixels,
            mode: useProjectStore.getState().project.selection.mode,
          };
        },
        sampleRenderedPixel: (cssX, cssY) =>
          engine?.sampleRenderedPixel(cssX, cssY) ?? [0, 0, 0, 0],
        readFlatCanvasRgba: (w, h, options) =>
          engine?.readFlatCanvasRgba(w, h, options) ?? new Uint8Array(0),
        read3DViewportRgba: (w, h) => engine?.read3DViewportRgba(w, h) ?? new Uint8Array(0),
        getMapEffectiveRgba: () =>
          mapRegistry.isAllocated ? mapRegistry.color.effective : new Uint8ClampedArray(0),
        emitColorDirtyPixel: (x, y, rgba) => {
          if (!mapRegistry.isAllocated) return;
          const idx = (y * mapRegistry.width + x) * 4;
          mapRegistry.color.working[idx] = rgba[0];
          mapRegistry.color.working[idx + 1] = rgba[1];
          mapRegistry.color.working[idx + 2] = rgba[2];
          mapRegistry.color.working[idx + 3] = rgba[3];
          mapRegistry.color.effective[idx] = rgba[0];
          mapRegistry.color.effective[idx + 1] = rgba[1];
          mapRegistry.color.effective[idx + 2] = rgba[2];
          mapRegistry.color.effective[idx + 3] = rgba[3];
          mapRegistry.emitDirty('color', { x, y, w: 1, h: 1 });
        },
        emitColorDirtyBlock: (x, y, w, h, rgba) => {
          if (!mapRegistry.isAllocated) return;
          const x0 = Math.max(0, Math.floor(x));
          const y0 = Math.max(0, Math.floor(y));
          const x1 = Math.min(mapRegistry.width, Math.ceil(x + w));
          const y1 = Math.min(mapRegistry.height, Math.ceil(y + h));
          for (let py = y0; py < y1; py++) {
            const row = py * mapRegistry.width;
            for (let px = x0; px < x1; px++) {
              const idx = (row + px) * 4;
              mapRegistry.color.working[idx] = rgba[0];
              mapRegistry.color.working[idx + 1] = rgba[1];
              mapRegistry.color.working[idx + 2] = rgba[2];
              mapRegistry.color.working[idx + 3] = rgba[3];
              mapRegistry.color.effective[idx] = rgba[0];
              mapRegistry.color.effective[idx + 1] = rgba[1];
              mapRegistry.color.effective[idx + 2] = rgba[2];
              mapRegistry.color.effective[idx + 3] = rgba[3];
            }
          }
          mapRegistry.emitDirty('color', { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        },
        emitHeightDirtyBlock: (x, y, w, h, value) => {
          if (!mapRegistry.isAllocated) return;
          const x0 = Math.max(0, Math.floor(x));
          const y0 = Math.max(0, Math.floor(y));
          const x1 = Math.min(mapRegistry.width, Math.ceil(x + w));
          const y1 = Math.min(mapRegistry.height, Math.ceil(y + h));
          for (let py = y0; py < y1; py++) {
            const row = py * mapRegistry.width;
            for (let px = x0; px < x1; px++) {
              const idx = row + px;
              mapRegistry.heightMap.working[idx] = value;
              mapRegistry.heightMap.effective[idx] = value;
            }
          }
          mapRegistry.emitDirty('height', { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        },
        emitOpacityDirtyBlock: (x, y, w, h, value) => {
          if (!mapRegistry.isAllocated) return;
          const x0 = Math.max(0, Math.floor(x));
          const y0 = Math.max(0, Math.floor(y));
          const x1 = Math.min(mapRegistry.width, Math.ceil(x + w));
          const y1 = Math.min(mapRegistry.height, Math.ceil(y + h));
          for (let py = y0; py < y1; py++) {
            const row = py * mapRegistry.width;
            for (let px = x0; px < x1; px++) {
              const idx = row + px;
              mapRegistry.opacity.working[idx] = value;
              mapRegistry.opacity.effective[idx] = value;
            }
          }
          mapRegistry.emitDirty('opacity', { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        },
      };
    }

    const applySize = (w: number, h: number) => {
      const nextW = Math.max(1, Math.round(w));
      const nextH = Math.max(1, Math.round(h));
      viewportSizeRef.current = { width: nextW, height: nextH };
      setViewportSize({ width: nextW, height: nextH });
      const paneVp = resolvePane2DSize({ width: nextW, height: nextH });
      overlaySizeRef.current = paneVp;
      overlay.resize(paneVp.width, paneVp.height);
      engine?.resize(nextW, nextH);

      const { canvas } = useProjectStore.getState().project;
      if (!didInitialFitRef.current && nextW > 16 && nextH > 16) {
        didInitialFitRef.current = true;
        lastDimsRef.current = { widthPx: canvas.widthPx, heightPx: canvas.heightPx };
        useEditorStore
          .getState()
          .setPane2D(fitToViewport(paneVp, canvas.widthPx, canvas.heightPx));
      }
      syncEngineParams();
    };

    const rect = container.getBoundingClientRect();
    applySize(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        applySize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(container);

    const unsubProject = useProjectStore.subscribe((state) => {
      const { widthPx, heightPx } = state.project.canvas;
      const last = lastDimsRef.current;
      if (!last || last.widthPx !== widthPx || last.heightPx !== heightPx) {
        lastDimsRef.current = { widthPx, heightPx };
        const paneVp = resolvePane2DSize(viewportSizeRef.current);
        if (paneVp.width > 16 && paneVp.height > 16) {
          useEditorStore.getState().setPane2D(fitToViewport(paneVp, widthPx, heightPx));
        }
      }
      syncEngineParams();
      refreshCursorReadout();
    });

    const unsubEditor = useEditorStore.subscribe(() => {
      syncEngineParams();
    });

    const unsubMapDirty = mapRegistry.events.on('dirty', () => {
      syncEngineParams();
      refreshCursorReadout();
    });

    const unsubMapReplaced = mapRegistry.events.on('replaced', ({ mapId }) => {
      if (mapId === 'all' || mapId === 'height') {
        syncEngineParams();
      }
      refreshCursorReadout();
    });

    const unsubSelectionChanged = mapRegistry.events.on('selectionChanged', () => {
      renderOverlay();
      syncAntsAnimation();
    });

    return () => {
      if (antsRafRef.current !== null) {
        cancelAnimationFrame(antsRafRef.current);
        antsRafRef.current = null;
      }
      clearCursorReadout();
      observer.disconnect();
      unsubProject();
      unsubEditor();
      unsubMapDirty();
      unsubMapReplaced();
      unsubSelectionChanged();
      if (window.__shadowpaintDebug) {
        delete window.__shadowpaintDebug;
      }
      setExportPreviewRenderer(null);
      engine?.dispose();
      engineRef.current = null;
      overlayRef.current = null;
    };
  }, [renderOverlay, syncAntsAnimation, syncEngineParams, t]);

  return {
    containerRef,
    webglCanvasRef,
    overlayCanvasRef,
    viewportSize,
    fitView,
    setZoom100,
    resetView3D,
    setCursor,
    setCursorImagePos,
    raycast3DCanvasPx,
  };
}
