import { useEffect, useRef, useState } from 'react';
import { Frame, Grid3x3, Lightbulb, Maximize2, RotateCcw, Ruler, Scan } from 'lucide-react';
import { mapRegistry } from '@/core/maps/MapRegistry';
import type { LightingMode, MapId } from '@/core/types';
import { getCalibrationMetrics } from '@/core/units/calibration';
import { PointerRouter } from '@/editor2d/input/PointerRouter';
import { clampSplitRatio, computeSplitPanes } from '@/editor2d/splitLayout';
import { zoomAtPoint, type ViewportSize } from '@/editor2d/viewTransform';
import { exportPackage } from '@/services/exportService';
import { saveProjectRelief, triggerOpenProjectDialog } from '@/services/fileService';
import {
  recordSettingsPatchHistory,
  recordTileHistory,
  redoGlobal,
  undoActiveMap,
  undoGlobal,
} from '@/services/historyService';
import { clearSelection, invertSelection, selectAllSelection } from '@/services/selectionService';
import { useEditorStore, type HeightDisplayMode } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { clearCursorReadout, scheduleCursorReadout } from '@/state/readoutStore';
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

function setProjectLightingModeWithHistory(mode: LightingMode): void {
  const current = useProjectStore.getState().project.lighting;
  if (current.mode === mode) return;
  const before = structuredClone(current);
  useProjectStore.getState().updateProject((d) => {
    d.lighting.mode = mode;
  }, true);
  const after = structuredClone(useProjectStore.getState().project.lighting);
  recordSettingsPatchHistory('settingsChange', {
    path: 'lighting',
    before,
    after,
  });
}

function toggleGridVisibilityWithHistory(target: '2d' | '3d'): void {
  const before = { ...useProjectStore.getState().project.grid };
  useProjectStore.getState().updateProject((d) => {
    if (target === '3d') {
      d.grid.show3D = !d.grid.show3D;
    } else {
      d.grid.show2D = !d.grid.show2D;
    }
  });
  recordSettingsPatchHistory('settingsChange', {
    path: 'grid',
    before,
    after: { ...useProjectStore.getState().project.grid },
  });
}

export function ViewportHost() {
  const { t } = useI18n();
  const canvas = useProjectStore((s) => s.project.canvas);
  const view3d = useProjectStore((s) => s.project.view3d);
  const grid = useProjectStore((s) => s.project.grid);
  const lightingMode = useProjectStore((s) => s.project.lighting.mode);
  const updateProject = useProjectStore((s) => s.updateProject);
  const layout = useEditorStore((s) => s.layout);
  const viewMode2D = useEditorStore((s) => s.viewMode2D);
  const view3DLighting = useEditorStore((s) => s.view3DLighting);
  const splitRatio = useEditorStore((s) => s.splitRatio);
  const heightDisplay = useEditorStore((s) => s.heightDisplay);
  const heightContourStepMm = useEditorStore((s) => s.heightContourStepMm);
  const showLampGizmos = useEditorStore((s) => s.showLampGizmos);
  const showRulers = useEditorStore((s) => s.showRulers);
  const pane2D = useEditorStore((s) => s.pane2D);
  const tool = useEditorStore((s) => s.tool);
  const brushSizeValue = useEditorStore((s) => s.brush.sizeValue);
  const brushSizeUnit = useEditorStore((s) => s.brush.sizeUnit);
  const setLayout = useEditorStore((s) => s.setLayout);
  const setViewMode2D = useEditorStore((s) => s.setViewMode2D);
  const setView3DLighting = useEditorStore((s) => s.setView3DLighting);
  const setSplitRatio = useEditorStore((s) => s.setSplitRatio);
  const setHeightDisplay = useEditorStore((s) => s.setHeightDisplay);
  const setHeightContourStepMm = useEditorStore((s) => s.setHeightContourStepMm);
  const setShowLampGizmos = useEditorStore((s) => s.setShowLampGizmos);
  const setShowRulers = useEditorStore((s) => s.setShowRulers);

  const {
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
  } = useEngine();

  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [splitHoverSide, setSplitHoverSide] = useState<'2d' | '3d'>('2d');
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const splitPanes = computeSplitPanes(viewportSize.width, viewportSize.height, splitRatio);
  const pane2DSize: ViewportSize =
    layout === 'split'
      ? { width: splitPanes.leftPane.width, height: splitPanes.leftPane.height }
      : viewportSize;

  const pane2DSizeRef = useRef<ViewportSize>(pane2DSize);
  const splitDividerXRef = useRef<number>(splitPanes.dividerX);
  const pointerRouterRef = useRef<PointerRouter | null>(null);
  const statusClearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    pane2DSizeRef.current = pane2DSize;
    splitDividerXRef.current = splitPanes.dividerX;
  }, [pane2DSize, splitPanes.dividerX]);

  // Attach PointerRouter to the 2D viewport container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const router = new PointerRouter({
      element: el,
      getViewportSize: () => pane2DSizeRef.current,
      getEditor: () => useEditorStore.getState(),
      setPane2D: (pane) => useEditorStore.getState().setPane2D(pane),
      setCursor,
      isPointInteractive: (screenPos) => {
        const currentLayout = useEditorStore.getState().layout;
        if (currentLayout === '2d') return true;
        if (currentLayout === 'split') {
          return screenPos.x < splitDividerXRef.current;
        }
        return false;
      },
      onLeaveInteractiveArea: () => {
        setCursorImagePos(null);
      },
      onCursorImageMove: (imagePos) => {
        scheduleCursorReadout(imagePos);
        setCursorImagePos(imagePos);
      },
      onPanningChange: setIsPanning,
      toolContext: {
        registry: mapRegistry,
        getProject: () => useProjectStore.getState().project,
        getEditor: () => useEditorStore.getState(),
        getZoom: () => useEditorStore.getState().pane2D.zoom,
        setBrushOption: (key, value) => {
          useEditorStore.getState().setBrushOption(key, value);
        },
        setRulerLine: (line) => {
          useEditorStore.getState().setRulerLine(line);
        },
        setCrossSectionLine: (line) => {
          useEditorStore.getState().setCrossSectionLine(line);
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
    router.setEnabled(useEditorStore.getState().layout !== '3d');
    pointerRouterRef.current = router;

    return () => {
      router.dispose();
      pointerRouterRef.current = null;
      if (statusClearTimerRef.current !== null) {
        window.clearTimeout(statusClearTimerRef.current);
        statusClearTimerRef.current = null;
      }
    };
  }, [containerRef, setCursor, setCursorImagePos]);

  useEffect(() => {
    pointerRouterRef.current?.setEnabled(layout !== '3d');
    clearCursorReadout();
    if (layout !== 'split') {
      setCursorImagePos(null);
    }
    if (layout === '2d') return;

    const el = containerRef.current;
    if (!el) return;

    const handleMove3D = (e: PointerEvent) => {
      const currentLayout = useEditorStore.getState().layout;
      if (currentLayout === '3d') {
        scheduleCursorReadout(raycast3DCanvasPx(e.clientX, e.clientY));
        return;
      }
      if (currentLayout === 'split') {
        const rect = el.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        if (localX >= splitDividerXRef.current) {
          setSplitHoverSide('3d');
          setCursorImagePos(null);
          scheduleCursorReadout(raycast3DCanvasPx(e.clientX, e.clientY));
        } else {
          setSplitHoverSide('2d');
        }
      }
    };

    const handleLeave3D = () => {
      scheduleCursorReadout(null);
      setCursorImagePos(null);
    };

    el.addEventListener('pointermove', handleMove3D);
    el.addEventListener('pointerleave', handleLeave3D);
    return () => {
      el.removeEventListener('pointermove', handleMove3D);
      el.removeEventListener('pointerleave', handleLeave3D);
    };
  }, [containerRef, layout, raycast3DCanvasPx, setCursorImagePos]);

  // Refresh overlay cursor ring when tool or brush size changes
  useEffect(() => {
    pointerRouterRef.current?.refreshCursor();
  }, [tool, brushSizeValue, brushSizeUnit, splitRatio, layout]);

  // Non-passive wheel zoom anchored to cursor in 2D / left pane of split mode
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const state = useEditorStore.getState();
      if (state.layout === '3d') return;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (state.layout === 'split' && sx >= splitDividerXRef.current) {
        return;
      }
      e.preventDefault();
      const projCanvas = useProjectStore.getState().project.canvas;
      const factor = Math.pow(2, -e.deltaY / 500);
      const next = zoomAtPoint(
        state.pane2D,
        pane2DSizeRef.current,
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

  // Keyboard shortcuts
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

      if (e.key === 'F1') {
        e.preventDefault();
        setLayout('2d');
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        setLayout('3d');
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        setLayout('split');
        return;
      }
      if (e.key === 'Home') {
        const currentLayout = useEditorStore.getState().layout;
        if (currentLayout === '3d' || currentLayout === 'split') {
          e.preventDefault();
          resetView3D();
        }
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        if (useEditorStore.getState().layout === '3d') return;
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
        } else if (!e.altKey && !e.shiftKey && lower === 'o') {
          e.preventDefault();
          triggerOpenProjectDialog();
        } else if (!e.altKey && e.shiftKey && lower === 's') {
          e.preventDefault();
          void saveProjectRelief({ saveAs: true });
        } else if (!e.altKey && !e.shiftKey && lower === 's') {
          e.preventDefault();
          void saveProjectRelief();
        } else if (!e.altKey && !e.shiftKey && lower === 'e') {
          e.preventDefault();
          void exportPackage();
        } else if (!e.altKey && !e.shiftKey && lower === 'a') {
          e.preventDefault();
          selectAllSelection();
        } else if (!e.altKey && !e.shiftKey && lower === 'd') {
          e.preventDefault();
          clearSelection();
        } else if (!e.altKey && e.shiftKey && lower === 'i') {
          e.preventDefault();
          invertSelection();
        } else if (!e.altKey && !e.shiftKey && lower === 'r') {
          e.preventDefault();
          const editor = useEditorStore.getState();
          editor.setShowRulers(!editor.showRulers);
        } else if (!e.altKey && !e.shiftKey && (e.code === 'Quote' || e.key === "'")) {
          e.preventDefault();
          const is3d = useEditorStore.getState().layout === '3d';
          toggleGridVisibilityWithHistory(is3d ? '3d' : '2d');
        }
        return;
      }

      if (e.altKey) return;

      const editor = useEditorStore.getState();

      if (e.shiftKey) {
        const lower = e.key.toLowerCase();
        if (e.code === 'Digit1') {
          e.preventDefault();
          editor.setViewMode2D('color');
        } else if (e.code === 'Digit2') {
          e.preventDefault();
          editor.setViewMode2D('height');
        } else if (e.code === 'Digit3') {
          e.preventDefault();
          editor.setViewMode2D('opacity');
        } else if (e.code === 'Digit4') {
          e.preventDefault();
          if (editor.layout === '3d') {
            setProjectLightingModeWithHistory('front');
          } else {
            editor.setViewMode2D('front');
          }
        } else if (e.code === 'Digit5') {
          e.preventDefault();
          if (editor.layout === '3d') {
            setProjectLightingModeWithHistory('back');
          } else {
            editor.setViewMode2D('back');
          }
        } else if (e.code === 'Digit6') {
          e.preventDefault();
          if (editor.layout === '3d') {
            setProjectLightingModeWithHistory('combined');
          } else {
            editor.setViewMode2D('combined');
          }
        } else if (e.code === 'Digit7') {
          e.preventDefault();
          editor.setLayout('3d');
        } else if (lower === 'm') {
          e.preventDefault();
          editor.setTool('selectEllipse');
        }
        return;
      }

      const lower = e.key.toLowerCase();
      if (lower === 'b') {
        editor.setTool('brush');
      } else if (lower === 'e') {
        editor.setTool('eraser');
      } else if (lower === 's') {
        editor.setTool('smooth');
      } else if (lower === 'r') {
        editor.setTool('blur');
      } else if (lower === 'g') {
        editor.setTool('gradient');
      } else if (lower === 'f') {
        editor.setTool('fill');
      } else if (lower === 'i') {
        editor.setTool('eyedropper');
      } else if (lower === 'h') {
        editor.setTool('pan');
      } else if (lower === 'u') {
        editor.setTool('ruler');
      } else if (lower === 'x') {
        editor.setTool('crossSection');
      } else if (lower === 'm') {
        editor.setTool('selectRect');
      } else if (lower === 'l') {
        editor.setTool('selectLasso');
      } else if (lower === 'w') {
        editor.setTool('magicWand');
      } else if (lower === 'q') {
        editor.setTool('maskBrush');
      } else if (e.key === 'Escape' && editor.tool === 'ruler' && editor.rulerLine) {
        editor.setRulerLine(null);
      } else if (e.key === 'Escape' && editor.tool === 'crossSection' && editor.crossSectionLine) {
        editor.setCrossSectionLine(null);
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
  }, [fitView, resetView3D, setLayout, setZoom100]);

  const handleToggleFrame = () => {
    const before = { ...useProjectStore.getState().project.view3d };
    updateProject((d) => {
      d.view3d.showFrame = !d.view3d.showFrame;
    });
    recordSettingsPatchHistory('settingsChange', {
      path: 'view3d',
      before,
      after: { ...useProjectStore.getState().project.view3d },
    });
  };

  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    setIsDraggingSplit(true);
    const updateFromClientX = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = clampSplitRatio((clientX - rect.left) / rect.width);
      setSplitRatio(ratio);
    };

    const onMove = (ev: PointerEvent) => {
      updateFromClientX(ev.clientX);
    };
    const onUp = () => {
      setIsDraggingSplit(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const active3DLightingValue = layout === 'split' ? view3DLighting : lightingMode;
  const handleChange3DLighting = (value: string) => {
    if (value !== 'front' && value !== 'back' && value !== 'combined') return;
    if (layout === 'split') {
      setView3DLighting(value);
    } else {
      setProjectLightingModeWithHistory(value);
    }
  };

  const cursorClass = isDraggingSplit
    ? 'cursor-col-resize'
    : layout === '3d' || (layout === 'split' && splitHoverSide === '3d')
      ? 'cursor-grab active:cursor-grabbing'
      : isPanning
        ? 'cursor-grabbing'
        : spacePressed || tool === 'pan'
          ? 'cursor-grab'
          : 'cursor-crosshair';

  const render2DControls = (compact: boolean) => (
    <>
      <div className="flex items-center gap-1.5">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={viewMode2D}
          onValueChange={(value) => {
            if (
              value === 'color' ||
              value === 'height' ||
              value === 'opacity' ||
              value === 'front' ||
              value === 'back' ||
              value === 'combined'
            ) {
              setViewMode2D(value);
            }
          }}
        >
          <ToggleGroupItem
            value="color"
            data-testid="mode-color"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeColor')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="height"
            data-testid="mode-height"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeHeight')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="opacity"
            data-testid="mode-opacity"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeOpacity')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="front"
            data-testid="mode-front"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeFront')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="back"
            data-testid="mode-back"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeBack')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="combined"
            data-testid="mode-combined"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeCombined')}
          </ToggleGroupItem>
        </ToggleGroup>

        {viewMode2D === 'height' && (
          <div className="flex items-center gap-1">
            <Select
              value={heightDisplay}
              onValueChange={(v) => setHeightDisplay(v as HeightDisplayMode)}
            >
              <SelectTrigger
                size="sm"
                data-testid="height-display-select"
                aria-label={t('viewport.heightDisplayLabel')}
                className={compact ? 'h-6 w-28 text-[11px]' : 'h-7 w-40 text-xs'}
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
                  className={compact ? 'h-6 w-20 font-mono text-[11px]' : 'h-7 w-24 font-mono text-xs'}
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={grid.show2D ? 'secondary' : 'ghost'}
              size="xs"
              data-testid="btn-toggle-grid-2d"
              aria-pressed={grid.show2D}
              aria-label={t('viewport.toggleGridTooltip')}
              onClick={() => toggleGridVisibilityWithHistory('2d')}
              className="gap-1 text-xs"
            >
              <Grid3x3 className="size-3.5" />
              {!compact && <span className="hidden xl:inline">{t('viewport.toggleGrid')}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('viewport.toggleGridTooltip')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={showRulers ? 'secondary' : 'ghost'}
              size="xs"
              data-testid="btn-toggle-rulers"
              aria-pressed={showRulers}
              aria-label={t('viewport.toggleRulersTooltip')}
              onClick={() => setShowRulers(!showRulers)}
              className="gap-1 text-xs"
            >
              <Ruler className="size-3.5" />
              {!compact && <span className="hidden xl:inline">{t('viewport.toggleRulers')}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('viewport.toggleRulersTooltip')}</TooltipContent>
        </Tooltip>

        <span
          data-testid="viewport-zoom-pct"
          className="text-muted-foreground mr-0.5 min-w-10 text-right font-mono text-xs"
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
              <span>{t('viewport.zoomFit')}</span>
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
              <span>{t('viewport.zoom100')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('viewport.zoom100Tooltip')}</TooltipContent>
        </Tooltip>
      </div>
    </>
  );

  const render3DControls = (compact: boolean) => (
    <>
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={active3DLightingValue}
          onValueChange={handleChange3DLighting}
        >
          <ToggleGroupItem
            value="front"
            data-testid="view3d-mode-front"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeFront')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="back"
            data-testid="view3d-mode-back"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeBack')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="combined"
            data-testid="view3d-mode-combined"
            className={compact ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2.5 text-xs'}
          >
            {t('viewport.modeCombined')}
          </ToggleGroupItem>
        </ToggleGroup>
        {!compact && (
          <span className="text-muted-foreground hidden text-[11px] lg:inline">
            {t('viewport.orbitHint')}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={grid.show3D ? 'secondary' : 'ghost'}
              size="xs"
              data-testid="btn-toggle-grid-3d"
              aria-pressed={grid.show3D}
              aria-label={t('viewport.toggleGridTooltip')}
              onClick={() => toggleGridVisibilityWithHistory('3d')}
              className="gap-1 text-xs"
            >
              <Grid3x3 className="size-3.5" />
              {!compact && <span>{t('viewport.toggleGrid')}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('viewport.toggleGridTooltip')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={showLampGizmos ? 'secondary' : 'ghost'}
              size="xs"
              data-testid="btn-toggle-gizmos"
              aria-pressed={showLampGizmos}
              aria-label={t('viewport.toggleGizmosTooltip')}
              onClick={() => setShowLampGizmos(!showLampGizmos)}
              className="gap-1 text-xs"
            >
              <Lightbulb className="size-3.5" />
              {!compact && <span>{t('viewport.toggleGizmos')}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('viewport.toggleGizmosTooltip')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={view3d.showFrame ? 'secondary' : 'ghost'}
              size="xs"
              data-testid="btn-toggle-frame"
              aria-pressed={view3d.showFrame}
              aria-label={t('viewport.toggleFrameTooltip')}
              onClick={handleToggleFrame}
              className="gap-1 text-xs"
            >
              <Frame className="size-3.5" />
              {!compact && <span>{t('viewport.toggleFrame')}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('viewport.toggleFrameTooltip')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              data-testid="btn-reset-view-3d"
              aria-label={t('viewport.resetView3dTooltip')}
              onClick={resetView3D}
              className="gap-1 text-xs"
            >
              <RotateCcw className="size-3.5" />
              {!compact && <span>{t('viewport.resetView3d')}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('viewport.resetView3dTooltip')}</TooltipContent>
        </Tooltip>
      </div>
    </>
  );

  return (
    <section
      aria-label={t('shell.viewportTitle')}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#121214]"
    >
      {layout === 'split' ? (
        <div
          className="border-border bg-card/70 flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-2.5 py-1"
          data-testid="viewport-split-toolbar"
        >
          <div className="flex flex-wrap items-center gap-1.5">{render2DControls(true)}</div>
          <div className="bg-border/60 hidden h-5 w-px 2xl:block" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-1.5">{render3DControls(true)}</div>
        </div>
      ) : (
        <div className="border-border bg-card/70 flex h-9 shrink-0 items-center justify-between gap-2 border-b px-2.5">
          {layout === '3d' ? render3DControls(false) : render2DControls(false)}
        </div>
      )}

      <div
        ref={containerRef}
        data-testid="viewport-canvas-area"
        data-layout={layout}
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
          style={
            layout === 'split'
              ? { width: `${pane2DSize.width}px`, height: `${pane2DSize.height}px` }
              : undefined
          }
          className={`pointer-events-none absolute top-0 left-0 block ${
            layout === 'split' ? '' : 'h-full w-full'
          } ${layout === '3d' ? 'hidden' : ''}`}
        />

        {layout === 'split' && (
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={t('viewport.splitDividerLabel')}
            aria-valuenow={Math.round(splitPanes.splitRatio * 100)}
            aria-valuemin={20}
            aria-valuemax={80}
            data-testid="split-divider"
            onPointerDown={handleDividerPointerDown}
            onDoubleClick={() => setSplitRatio(0.5)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setSplitRatio(splitRatio - 0.05);
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setSplitRatio(splitRatio + 0.05);
              }
            }}
            style={{ left: `${splitPanes.dividerX}px` }}
            className="group focus-visible:ring-primary absolute top-0 bottom-0 z-20 flex w-3 -translate-x-1/2 cursor-col-resize items-center justify-center focus:outline-none focus-visible:ring-1"
          >
            <div className="bg-border group-hover:bg-primary/80 h-full w-px transition-colors" />
            <div className="border-border bg-card/90 group-hover:border-primary/70 absolute h-8 w-1.5 rounded-full border shadow-sm transition-colors" />
          </div>
        )}

        {(layout === '3d' || layout === 'split') && (
          <div
            data-testid="badge-relief-multiplier"
            style={layout === 'split' ? { left: `${splitPanes.dividerX + 12}px` } : undefined}
            className={`border-primary/40 bg-card/85 text-primary pointer-events-none absolute top-3 rounded-md border px-2 py-1 font-mono text-xs font-medium backdrop-blur-sm ${
              layout === 'split' ? '' : 'left-3'
            }`}
          >
            {t('viewport.reliefBadge', { mult: view3d.reliefMultiplier })}
          </div>
        )}

        {layout !== '3d' && (
          <div
            style={
              layout === 'split' ? { right: `${splitPanes.rightPane.width + 12}px` } : undefined
            }
            className={`pointer-events-none absolute bottom-3 flex flex-col gap-2 ${
              layout === 'split' ? '' : 'right-3'
            }`}
          >
            {viewMode2D === 'height' && (
              <HeightLegend
                mode={heightDisplay}
                minMm={canvas.minThicknessMm}
                maxMm={canvas.maxThicknessMm}
              />
            )}
            {viewMode2D === 'opacity' && <OpacityLegend />}
          </div>
        )}
      </div>
    </section>
  );
}
