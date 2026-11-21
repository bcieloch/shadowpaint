import { useEffect, type RefObject } from 'react';
import {
  adjustBrushHardnessValue,
  adjustBrushSizeValue,
  isEditableTargetElement,
  matchesShortcutItem,
  parseBrushFlowShortcut,
  type ShortcutItemId,
} from '@/core/shortcuts';
import type { LightingMode } from '@/core/types';
import { getCalibrationMetrics } from '@/core/units/calibration';
import type { PointerRouter } from '@/editor2d/input/PointerRouter';
import { zoomAtPoint, type ViewportSize } from '@/editor2d/viewTransform';
import { exportPackage } from '@/services/exportService';
import { saveProjectRelief, triggerOpenProjectDialog } from '@/services/fileService';
import {
  recordSettingsPatchHistory,
  redoGlobal,
  undoActiveMap,
  undoGlobal,
} from '@/services/historyService';
import { addLayerToMap, duplicateLayerOnMap, mergeLayerDownOnMap } from '@/services/layerService';
import { clearSelection, invertSelection, selectAllSelection } from '@/services/selectionService';
import { useEditorStore } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { hasOpenModalDialog, useUiStore } from '@/state/uiStore';

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

export interface UseShortcutsOptions {
  pointerRouterRef: RefObject<PointerRouter | null>;
  pane2DSizeRef: RefObject<ViewportSize>;
  fitView: () => void;
  setZoom100: () => void;
  resetView3D: () => void;
  setSpacePressed: (pressed: boolean) => void;
  setIsPanning: (panning: boolean) => void;
}

export function useShortcuts({
  pointerRouterRef,
  pane2DSizeRef,
  fitView,
  setZoom100,
  resetView3D,
  setSpacePressed,
  setIsPanning,
}: UseShortcutsOptions): void {
  useEffect(() => {
    const adjustBrushSize = (scale: number) => {
      const editor = useEditorStore.getState();
      const projCanvas = useProjectStore.getState().project.canvas;
      const pxPerCm = Math.max(0.001, getCalibrationMetrics(projCanvas).pxPerCm);
      const next = adjustBrushSizeValue(
        editor.brush.sizeValue,
        editor.brush.sizeUnit,
        pxPerCm,
        scale,
      );
      editor.setBrushOption('sizeValue', next);
      pointerRouterRef.current?.refreshCursor();
    };

    const adjustHardness = (delta: number) => {
      const editor = useEditorStore.getState();
      const next = adjustBrushHardnessValue(editor.brush.hardness, delta);
      editor.setBrushOption('hardness', next);
      pointerRouterRef.current?.refreshCursor();
    };

    const zoomStep2D = (factor: number) => {
      const editor = useEditorStore.getState();
      if (editor.layout === '3d') return;
      const paneSize = pane2DSizeRef.current;
      if (paneSize.width <= 0 || paneSize.height <= 0) return;
      const projCanvas = useProjectStore.getState().project.canvas;
      const next = zoomAtPoint(
        editor.pane2D,
        paneSize,
        projCanvas.widthPx,
        projCanvas.heightPx,
        paneSize.width / 2,
        paneSize.height / 2,
        editor.pane2D.zoom * factor,
      );
      editor.setPane2D(next);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTargetElement(e.target)) return;

      const uiState = useUiStore.getState();
      const modalOpen = hasOpenModalDialog(uiState);
      if (modalOpen) return;

      const editor = useEditorStore.getState();
      const custom = editor.customShortcuts;
      const match = (id: ShortcutItemId) => matchesShortcutItem(e, id, custom);

      // 1. Check all customizable shortcuts first (honoring user rebindings)
      if (match('layout2d')) {
        e.preventDefault();
        editor.setLayout('2d');
        return;
      }
      if (match('layout3d')) {
        e.preventDefault();
        editor.setLayout('3d');
        return;
      }
      if (match('layoutSplit')) {
        e.preventDefault();
        editor.setLayout('split');
        return;
      }
      if (match('reset3d')) {
        if (editor.layout === '3d' || editor.layout === 'split') {
          e.preventDefault();
          resetView3D();
        }
        return;
      }
      if (match('togglePanels')) {
        e.preventDefault();
        editor.togglePanelsHidden();
        return;
      }
      if (match('openShortcuts')) {
        e.preventDefault();
        uiState.setDialogOpen('shortcutsOpen', true);
        return;
      }
      if (match('openGuide')) {
        e.preventDefault();
        uiState.setDialogOpen('guideOpen', true);
        return;
      }
      if (match('fileNew')) {
        e.preventDefault();
        uiState.setDialogOpen('newProjectOpen', true);
        return;
      }
      if (match('historyUndoMap')) {
        e.preventDefault();
        undoActiveMap();
        return;
      }
      if (match('historyRedo')) {
        e.preventDefault();
        redoGlobal();
        return;
      }
      if (match('historyUndo')) {
        e.preventDefault();
        undoGlobal();
        return;
      }
      if (match('zoomFit')) {
        e.preventDefault();
        fitView();
        return;
      }
      if (match('zoom100')) {
        e.preventDefault();
        setZoom100();
        return;
      }
      if (match('fileImport')) {
        e.preventDefault();
        uiState.setDialogOpen('importWizardOpen', true);
        return;
      }
      if (match('fileOpen')) {
        e.preventDefault();
        triggerOpenProjectDialog();
        return;
      }
      if (match('fileSaveAs')) {
        e.preventDefault();
        void saveProjectRelief({ saveAs: true });
        return;
      }
      if (match('fileSave')) {
        e.preventDefault();
        void saveProjectRelief();
        return;
      }
      if (match('fileExport')) {
        e.preventDefault();
        void exportPackage();
        return;
      }
      if (match('selectAll')) {
        e.preventDefault();
        selectAllSelection();
        return;
      }
      if (match('clearSelection')) {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (match('invertSelection')) {
        e.preventDefault();
        invertSelection();
        return;
      }
      if (match('layerAdd')) {
        e.preventDefault();
        addLayerToMap(editor.activeMap);
        return;
      }
      if (match('layerDuplicate')) {
        e.preventDefault();
        duplicateLayerOnMap(editor.activeMap);
        return;
      }
      if (match('layerMergeDown')) {
        e.preventDefault();
        mergeLayerDownOnMap(editor.activeMap);
        return;
      }
      if (match('toggleRulers')) {
        e.preventDefault();
        editor.setShowRulers(!editor.showRulers);
        return;
      }
      if (match('toggleGrid')) {
        e.preventDefault();
        toggleGridVisibilityWithHistory(editor.layout === '3d' ? '3d' : '2d');
        return;
      }
      if (match('toolBrush')) {
        e.preventDefault();
        editor.setTool('brush');
        return;
      }
      if (match('toolEraser')) {
        e.preventDefault();
        editor.setTool('eraser');
        return;
      }
      if (match('toolSmooth')) {
        e.preventDefault();
        editor.setTool('smooth');
        return;
      }
      if (match('toolBlur')) {
        e.preventDefault();
        editor.setTool('blur');
        return;
      }
      if (match('toolGradient')) {
        e.preventDefault();
        editor.setTool('gradient');
        return;
      }
      if (match('toolFill')) {
        e.preventDefault();
        editor.setTool('fill');
        return;
      }
      if (match('toolEyedropper')) {
        e.preventDefault();
        editor.setTool('eyedropper');
        return;
      }
      if (match('toolPan')) {
        e.preventDefault();
        editor.setTool('pan');
        return;
      }
      if (match('toolRuler')) {
        e.preventDefault();
        editor.setTool('ruler');
        return;
      }
      if (match('toolCrossSection')) {
        e.preventDefault();
        editor.setTool('crossSection');
        return;
      }
      if (match('toolSelectRect')) {
        e.preventDefault();
        editor.setTool('selectRect');
        return;
      }
      if (match('toolSelectEllipse')) {
        e.preventDefault();
        editor.setTool('selectEllipse');
        return;
      }
      if (match('toolSelectLasso')) {
        e.preventDefault();
        editor.setTool('selectLasso');
        return;
      }
      if (match('toolMagicWand')) {
        e.preventDefault();
        editor.setTool('magicWand');
        return;
      }
      if (match('toolMaskBrush')) {
        e.preventDefault();
        editor.setTool('maskBrush');
        return;
      }
      if (match('brushSize')) {
        e.preventDefault();
        adjustBrushSize(1 / 1.18);
        return;
      }
      if (match('brushSizeIncrease')) {
        e.preventDefault();
        adjustBrushSize(1.18);
        return;
      }
      if (match('brushHardness')) {
        e.preventDefault();
        adjustHardness(-0.05);
        return;
      }
      if (match('brushHardnessIncrease')) {
        e.preventDefault();
        adjustHardness(0.05);
        return;
      }
      if (match('zoomStep')) {
        e.preventDefault();
        zoomStep2D(1.25);
        return;
      }
      if (match('zoomOut')) {
        e.preventDefault();
        zoomStep2D(1 / 1.25);
        return;
      }
      if (match('activeMap')) {
        e.preventDefault();
        editor.setActiveMap('color');
        return;
      }
      if (match('activeMapHeight')) {
        e.preventDefault();
        editor.setActiveMap('height');
        return;
      }
      if (match('activeMapOpacity')) {
        e.preventDefault();
        editor.setActiveMap('opacity');
        return;
      }

      // 2. Non-customizable special bindings (Space hold to pan, Escape, view mode ranges, flow digits)
      const mod = e.ctrlKey || e.metaKey;

      if (e.code === 'Space' && !e.repeat && !mod && !e.altKey) {
        if (editor.layout === '3d') return;
        e.preventDefault();
        setSpacePressed(true);
        pointerRouterRef.current?.setSpacePressed(true);
        pointerRouterRef.current?.refreshCursor();
        return;
      }

      if (mod) return;

      if (e.altKey) {
        if (!e.shiftKey) {
          const digitMatch = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
          const digit = digitMatch ? Number(digitMatch[1]) : Number.NaN;
          const flow = Number.isInteger(digit) ? parseBrushFlowShortcut(digit, true) : null;
          if (flow !== null) {
            e.preventDefault();
            editor.setBrushOption('flow', flow);
          }
        }
        return;
      }

      if (e.shiftKey) {
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
        }
        return;
      }

      if (e.key === 'Escape') {
        if (uiState.leftDrawerOpen || uiState.rightDrawerOpen) {
          uiState.setLeftDrawerOpen(false);
          uiState.setRightDrawerOpen(false);
        } else if (editor.tool === 'ruler' && editor.rulerLine) {
          editor.setRulerLine(null);
        } else if (editor.tool === 'crossSection' && editor.crossSectionLine) {
          editor.setCrossSectionLine(null);
        }
      } else if (/^[04-9]$/.test(e.key)) {
        const flow = parseBrushFlowShortcut(Number(e.key), false);
        if (flow !== null) {
          editor.setBrushOption('flow', flow);
        }
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
  }, [
    fitView,
    pane2DSizeRef,
    pointerRouterRef,
    resetView3D,
    setIsPanning,
    setSpacePressed,
    setZoom100,
  ]);
}
