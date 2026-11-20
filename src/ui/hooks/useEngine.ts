import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { OverlayRenderer, type OverlayCursorState } from '@/editor2d/overlay/OverlayRenderer';
import { fitToViewport, zoom100, type ViewportSize } from '@/editor2d/viewTransform';
import { Engine, type FlatRenderMode } from '@/engine3d/Engine';
import { detectWebGL2Support } from '@/lib/webgl';
import { ensureInitialProjectAllocated } from '@/services/projectService';
import { useEditorStore, type ViewMode2D } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { useI18n } from '@/ui/hooks/useI18n';

function toFlatRenderMode(viewMode: ViewMode2D): FlatRenderMode {
  if (viewMode === 'height') return 'height';
  if (viewMode === 'opacity') return 'opacity';
  return 'color';
}

export interface UseEngineResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  webglCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewportSize: ViewportSize;
  fitView: () => void;
  setZoom100: () => void;
  resetView3D: () => void;
  setCursor: (cursor: OverlayCursorState | null) => void;
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
  const didInitialFitRef = useRef(false);
  const lastDimsRef = useRef<{ widthPx: number; heightPx: number } | null>(null);

  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 1, height: 1 });

  const renderOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const { canvas } = useProjectStore.getState().project;
    const { layout, pane2D } = useEditorStore.getState();
    if (layout === '3d') {
      overlay.clear();
      return;
    }
    overlay.render({
      viewport: viewportSizeRef.current,
      imageWidth: canvas.widthPx,
      imageHeight: canvas.heightPx,
      transform: pane2D,
      cursor: cursorRef.current,
    });
  }, []);

  const syncEngineParams = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const project = useProjectStore.getState().project;
    const editor = useEditorStore.getState();
    engine.setRenderParams({
      layout: editor.layout,
      canvas: project.canvas,
      material: project.material,
      view3d: project.view3d,
      viewMode2D: toFlatRenderMode(editor.viewMode2D),
      heightDisplay: editor.heightDisplay,
      contourStepMm: editor.heightContourStepMm,
      pane2D: editor.pane2D,
    });
    renderOverlay();
  }, [renderOverlay]);

  const fitView = useCallback(() => {
    const { canvas } = useProjectStore.getState().project;
    const vp = viewportSizeRef.current;
    if (vp.width <= 1 || vp.height <= 1) return;
    useEditorStore.getState().setPane2D(fitToViewport(vp, canvas.widthPx, canvas.heightPx));
  }, []);

  const setZoom100 = useCallback(() => {
    useEditorStore.getState().setPane2D(zoom100(viewportSizeRef.current));
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

      window.__shadowpaintDebug = {
        getMemoryInfo: () => engine?.getMemoryInfo() ?? { geometries: 0, textures: 0, programs: 0 },
        getBuiltDimensions: () =>
          engine?.getBuiltDimensions() ?? { widthPx: 0, heightPx: 0, widthCm: 0, heightCm: 0 },
        get3DStats: () => engine?.get3DStats() ?? null,
        readFlatCanvasRgba: (w, h) => engine?.readFlatCanvasRgba(w, h) ?? new Uint8Array(0),
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
      };
    }

    const applySize = (w: number, h: number) => {
      const nextW = Math.max(1, Math.round(w));
      const nextH = Math.max(1, Math.round(h));
      viewportSizeRef.current = { width: nextW, height: nextH };
      setViewportSize({ width: nextW, height: nextH });
      overlay.resize(nextW, nextH);
      engine?.resize(nextW, nextH);

      const { canvas } = useProjectStore.getState().project;
      if (!didInitialFitRef.current && nextW > 16 && nextH > 16) {
        didInitialFitRef.current = true;
        lastDimsRef.current = { widthPx: canvas.widthPx, heightPx: canvas.heightPx };
        useEditorStore
          .getState()
          .setPane2D(
            fitToViewport({ width: nextW, height: nextH }, canvas.widthPx, canvas.heightPx),
          );
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
        const vp = viewportSizeRef.current;
        if (vp.width > 16 && vp.height > 16) {
          useEditorStore.getState().setPane2D(fitToViewport(vp, widthPx, heightPx));
        }
      }
      syncEngineParams();
    });

    const unsubEditor = useEditorStore.subscribe(() => {
      syncEngineParams();
    });

    const unsubMapReplaced = mapRegistry.events.on('replaced', ({ mapId }) => {
      if (mapId === 'all') {
        syncEngineParams();
      }
    });

    return () => {
      observer.disconnect();
      unsubProject();
      unsubEditor();
      unsubMapReplaced();
      if (window.__shadowpaintDebug) {
        delete window.__shadowpaintDebug;
      }
      engine?.dispose();
      engineRef.current = null;
      overlayRef.current = null;
    };
  }, [syncEngineParams, t]);

  return {
    containerRef,
    webglCanvasRef,
    overlayCanvasRef,
    viewportSize,
    fitView,
    setZoom100,
    resetView3D,
    setCursor,
  };
}
