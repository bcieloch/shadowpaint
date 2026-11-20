import type { Vec2 } from '@/core/types';
import { brushSizeToPx, getCalibrationMetrics } from '@/core/units/calibration';
import type { OverlayCursorState } from '@/editor2d/overlay/OverlayRenderer';
import {
  createToolRegistry,
  type Tool,
  type ToolContext,
  type ToolPointerEvent,
} from '@/editor2d/tools';
import { screenToImagePx, type ViewportSize } from '@/editor2d/viewTransform';
import type { EditorState, Pane2DState, ToolId } from '@/state/editorStore';

export interface PointerRouterDeps {
  element: HTMLElement;
  getViewportSize: () => ViewportSize;
  getEditor: () => EditorState;
  setPane2D: (pane: Partial<Pane2DState>) => void;
  setCursor: (cursor: OverlayCursorState | null) => void;
  isPointInteractive?: (screenPos: Vec2) => boolean;
  onLeaveInteractiveArea?: () => void;
  onCursorImageMove?: (imagePos: Vec2 | null) => void;
  onPanningChange?: (isPanning: boolean) => void;
  toolContext: ToolContext;
}

interface PanDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
}

export class PointerRouter {
  private readonly element: HTMLElement;
  private readonly deps: PointerRouterDeps;
  private readonly tools: Partial<Record<ToolId, Tool>>;

  private enabled = true;
  private spacePressed = false;
  private panDrag: PanDragState | null = null;
  private activeTool: Tool | null = null;
  private activePointerId: number | null = null;
  private lastScreenPos: Vec2 | null = null;
  private disposed = false;

  constructor(deps: PointerRouterDeps) {
    this.element = deps.element;
    this.deps = deps;
    this.tools = createToolRegistry();

    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointermove', this.handlePointerMove);
    this.element.addEventListener('pointerup', this.handlePointerUp);
    this.element.addEventListener('pointercancel', this.handlePointerCancel);
    this.element.addEventListener('pointerleave', this.handlePointerLeave);
    this.element.addEventListener('auxclick', this.handleAuxClick);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.cancelActive();
      this.lastScreenPos = null;
      this.deps.setCursor(null);
      this.deps.onCursorImageMove?.(null);
    }
  }

  setSpacePressed(pressed: boolean): void {
    this.spacePressed = pressed;
  }

  refreshCursor(): void {
    if (!this.enabled || !this.lastScreenPos) return;
    if (this.deps.isPointInteractive && !this.deps.isPointInteractive(this.lastScreenPos)) {
      return;
    }
    this.emitCursor(this.lastScreenPos);
  }

  cancelActive(): void {
    if (this.panDrag) {
      this.releaseCaptureSafe(this.panDrag.pointerId);
      this.panDrag = null;
      this.deps.onPanningChange?.(false);
    }
    if (this.activeTool && this.activePointerId !== null) {
      this.releaseCaptureSafe(this.activePointerId);
      this.activeTool.onCancel(this.deps.toolContext);
      this.activeTool = null;
      this.activePointerId = null;
      this.refreshCursor();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelActive();
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerCancel);
    this.element.removeEventListener('pointerleave', this.handlePointerLeave);
    this.element.removeEventListener('auxclick', this.handleAuxClick);
  }

  private blurActiveEditable(): void {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== this.element &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable)
    ) {
      active.blur();
    }
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (this.disposed || !this.enabled) return;
    const screenPos = this.toScreenPos(e);
    if (this.deps.isPointInteractive && !this.deps.isPointInteractive(screenPos)) {
      return;
    }

    this.blurActiveEditable();
    const editor = this.deps.getEditor();

    const isMiddle = e.button === 1;
    const isSpaceLeft = this.spacePressed && e.button === 0;
    const isPanToolLeft = editor.tool === 'pan' && e.button === 0;

    if (isMiddle || isSpaceLeft || isPanToolLeft) {
      e.preventDefault();
      this.setCaptureSafe(e.pointerId);
      this.panDrag = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: editor.pane2D.panX,
        startPanY: editor.pane2D.panY,
      };
      this.deps.onPanningChange?.(true);
      return;
    }

    if (e.button !== 0 || this.activePointerId !== null) return;

    const tool = this.tools[editor.tool];
    if (!tool) return;

    e.preventDefault();
    this.setCaptureSafe(e.pointerId);
    this.activeTool = tool;
    this.activePointerId = e.pointerId;

    this.lastScreenPos = screenPos;
    tool.onDown(this.toToolEvent(e, screenPos), this.deps.toolContext);
    this.emitCursor(screenPos);
  };

  private readonly handlePointerMove = (e: PointerEvent): void => {
    if (this.disposed || !this.enabled) return;

    const screenPos = this.toScreenPos(e);

    if (this.panDrag && this.panDrag.pointerId === e.pointerId) {
      this.lastScreenPos = screenPos;
      const dx = e.clientX - this.panDrag.startClientX;
      const dy = e.clientY - this.panDrag.startClientY;
      this.deps.setPane2D({
        panX: this.panDrag.startPanX + dx,
        panY: this.panDrag.startPanY + dy,
      });
      this.emitCursor(screenPos);
      return;
    }

    if (this.activeTool && this.activePointerId === e.pointerId) {
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const events = coalesced.length > 0 ? coalesced : [e];
      for (const ce of events) {
        const ceScreen = this.toScreenPos(ce);
        this.lastScreenPos = ceScreen;
        this.activeTool.onMove(this.toToolEvent(ce, ceScreen), this.deps.toolContext);
      }
      if (this.lastScreenPos) {
        this.emitCursor(this.lastScreenPos);
      }
      return;
    }

    if (this.deps.isPointInteractive && !this.deps.isPointInteractive(screenPos)) {
      if (this.lastScreenPos !== null) {
        this.lastScreenPos = null;
        this.deps.setCursor(null);
        this.deps.onLeaveInteractiveArea?.();
      }
      return;
    }

    this.lastScreenPos = screenPos;
    this.emitCursor(screenPos);
  };

  private readonly handlePointerUp = (e: PointerEvent): void => {
    if (this.disposed || !this.enabled) return;

    if (this.panDrag && this.panDrag.pointerId === e.pointerId) {
      this.releaseCaptureSafe(e.pointerId);
      this.panDrag = null;
      this.deps.onPanningChange?.(false);
      return;
    }

    if (this.activeTool && this.activePointerId === e.pointerId) {
      this.releaseCaptureSafe(e.pointerId);
      const screenPos = this.toScreenPos(e);
      this.lastScreenPos = screenPos;
      this.activeTool.onUp(this.toToolEvent(e, screenPos), this.deps.toolContext);
      this.activeTool = null;
      this.activePointerId = null;
      if (this.deps.isPointInteractive && !this.deps.isPointInteractive(screenPos)) {
        this.lastScreenPos = null;
        this.deps.setCursor(null);
        this.deps.onLeaveInteractiveArea?.();
      } else {
        this.emitCursor(screenPos);
      }
    }
  };

  private readonly handlePointerCancel = (e: PointerEvent): void => {
    if (this.disposed || !this.enabled) return;

    if (this.panDrag && this.panDrag.pointerId === e.pointerId) {
      this.releaseCaptureSafe(e.pointerId);
      this.panDrag = null;
      this.deps.onPanningChange?.(false);
      return;
    }

    if (this.activeTool && this.activePointerId === e.pointerId) {
      this.releaseCaptureSafe(e.pointerId);
      this.activeTool.onCancel(this.deps.toolContext);
      this.activeTool = null;
      this.activePointerId = null;
      this.refreshCursor();
    }
  };

  private readonly handlePointerLeave = (): void => {
    if (!this.enabled || this.activePointerId !== null || this.panDrag !== null) return;
    this.lastScreenPos = null;
    this.deps.setCursor(null);
    this.deps.onCursorImageMove?.(null);
  };

  private readonly handleAuxClick = (e: MouseEvent): void => {
    if (!this.enabled) return;
    if (e.button === 1 && (!this.deps.isPointInteractive || this.deps.isPointInteractive(this.toMouseScreenPos(e)))) {
      e.preventDefault();
    }
  };

  private toMouseScreenPos(e: MouseEvent): Vec2 {
    const rect = this.element.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private toScreenPos(e: PointerEvent): Vec2 {
    const rect = this.element.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private toImagePos(screenPos: Vec2): Vec2 {
    const { canvas } = this.deps.toolContext.getProject();
    const { pane2D } = this.deps.getEditor();
    return screenToImagePx(
      pane2D,
      this.deps.getViewportSize(),
      canvas.widthPx,
      canvas.heightPx,
      screenPos.x,
      screenPos.y,
    );
  }

  private toToolEvent(e: PointerEvent, screenPos: Vec2): ToolPointerEvent {
    return {
      screenPos,
      imagePos: this.toImagePos(screenPos),
      pressure: e.pressure,
      pointerType: e.pointerType,
      buttons: e.buttons,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    };
  }

  private emitCursor(screenPos: Vec2): void {
    const editor = this.deps.getEditor();
    const project = this.deps.toolContext.getProject();
    const imagePos = this.toImagePos(screenPos);

    let radiusPx: number | undefined;
    if (
      (editor.tool === 'brush' ||
        editor.tool === 'eraser' ||
        editor.tool === 'smooth' ||
        editor.tool === 'blur' ||
        editor.tool === 'maskBrush') &&
      !this.spacePressed
    ) {
      const metrics = getCalibrationMetrics(project.canvas);
      const diameterPx = Math.max(
        1,
        brushSizeToPx(editor.brush.sizeValue, editor.brush.sizeUnit, metrics.pxPerCm),
      );
      radiusPx = diameterPx / 2;
    }

    this.deps.setCursor({
      screenPos,
      imagePos,
      radiusPx,
      selectionDraft: this.activeTool?.getOverlayPreview?.() ?? null,
    });
    this.deps.onCursorImageMove?.(imagePos);
  }

  private setCaptureSafe(pointerId: number): void {
    try {
      this.element.setPointerCapture(pointerId);
    } catch {
      // Ignore synthetic pointer events in headless tests without active pointerId
    }
  }

  private releaseCaptureSafe(pointerId: number): void {
    try {
      if (this.element.hasPointerCapture(pointerId)) {
        this.element.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore synthetic pointer events in headless tests
    }
  }
}
