import { useEffect, type RefObject } from 'react';
import {
  adjustBrushHardnessValue,
  adjustBrushSizeValue,
  isEditableTargetElement,
  parseBrushFlowShortcut,
} from '@/core/shortcuts';
import type { LightingMode } from '@/core/types';
import { getCalibrationMetrics } from '@/core/units/calibration';
import type { PointerRouter } from '@/editor2d/input/PointerRouter';
import { zoomAtPoint, type ViewportSize } from '@/editor2d/viewTransform';
import { exportPackage } from '@/services/exportService';
import { saveProjectRelief, triggerOpenProjectDialog } from '@/services/fileService';
import { recordSettingsPatchHistory, redoGlobal, undoActiveMap, undoGlobal } from '@/services/historyService';
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
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'F1') {
        e.preventDefault();
        editor.setLayout('2d');
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        editor.setLayout('3d');
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        editor.setLayout('split');
        return;
      }
      if (e.key === 'Home' && !mod && !e.altKey) {
        if (editor.layout === '3d' || editor.layout === 'split') {
          e.preventDefault();
          resetView3D();
        }
        return;
      }

      if (e.key === 'Tab' && !mod && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        editor.togglePanelsHidden();
        return;
      }

      if ((e.key === '?' || (e.shiftKey && e.code === 'Slash')) && !mod && !e.altKey) {
        e.preventDefault();
        uiState.setDialogOpen('shortcutsOpen', true);
        return;
      }

      if (e.code === 'Space' && !e.repeat && !mod && !e.altKey) {
        if (editor.layout === '3d') return;
        e.preventDefault();
        setSpacePressed(true);
        pointerRouterRef.current?.setSpacePressed(true);
        pointerRouterRef.current?.refreshCursor();
        return;
      }

      if (mod) {
        const lower = e.key.toLowerCase();
        if (e.altKey && !e.shiftKey && lower === 'n') {
          e.preventDefault();
          uiState.setDialogOpen('newProjectOpen', true);
        } else if (e.altKey && !e.shiftKey && lower === 'z') {
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
        } else if (!e.altKey && !e.shiftKey && e.key === '0') {
          e.preventDefault();
          fitView();
        } else if (!e.altKey && !e.shiftKey && e.key === '1') {
          e.preventDefault();
          setZoom100();
        } else if (!e.altKey && !e.shiftKey && lower === 'i') {
          e.preventDefault();
          uiState.setDialogOpen('importWizardOpen', true);
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
          editor.setShowRulers(!editor.showRulers);
        } else if (!e.altKey && !e.shiftKey && (e.code === 'Quote' || e.key === "'")) {
          e.preventDefault();
          toggleGridVisibilityWithHistory(editor.layout === '3d' ? '3d' : '2d');
        }
        return;
      }

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
        } else if (e.code === 'BracketLeft' || e.key === '{') {
          e.preventDefault();
          adjustHardness(-0.05);
        } else if (e.code === 'BracketRight' || e.key === '}') {
          e.preventDefault();
          adjustHardness(0.05);
        } else if (e.key === '+' || e.code === 'NumpadAdd') {
          e.preventDefault();
          zoomStep2D(1.25);
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
      } else if (e.key === 'Escape') {
        if (uiState.leftDrawerOpen || uiState.rightDrawerOpen) {
          uiState.setLeftDrawerOpen(false);
          uiState.setRightDrawerOpen(false);
        } else if (editor.tool === 'ruler' && editor.rulerLine) {
          editor.setRulerLine(null);
        } else if (editor.tool === 'crossSection' && editor.crossSectionLine) {
          editor.setCrossSectionLine(null);
        }
      } else if (e.code === 'BracketLeft' || e.key === '[') {
        e.preventDefault();
        adjustBrushSize(1 / 1.18);
      } else if (e.code === 'BracketRight' || e.key === ']') {
        e.preventDefault();
        adjustBrushSize(1.18);
      } else if (
        e.key === '+' ||
        e.key === '=' ||
        e.code === 'Equal' ||
        e.code === 'NumpadAdd'
      ) {
        e.preventDefault();
        zoomStep2D(1.25);
      } else if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        zoomStep2D(1 / 1.25);
      } else if (e.key === '1') {
        editor.setActiveMap('color');
      } else if (e.key === '2') {
        editor.setActiveMap('height');
      } else if (e.key === '3') {
        editor.setActiveMap('opacity');
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
