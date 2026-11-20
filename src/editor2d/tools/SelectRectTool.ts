import type { Rect, Vec2 } from '@/core/types';
import type { SelectionDraftPreview } from '@/editor2d/overlay/OverlayRenderer';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { createRectSelectionMask, normalizeSelectionRect } from '@/imaging/selectionOps';
import { applyShapeSelection, clearSelection } from '@/services/selectionService';

export class SelectRectTool implements Tool {
  readonly id = 'selectRect' as const;
  private startImage: Vec2 | null = null;
  private startScreen: Vec2 | null = null;
  private currentRect: Rect | null = null;
  private movedFarEnough = false;

  onDown(e: ToolPointerEvent): void {
    this.startImage = { ...e.imagePos };
    this.startScreen = { ...e.screenPos };
    this.currentRect = normalizeSelectionRect(e.imagePos, e.imagePos, e.shiftKey);
    this.movedFarEnough = false;
  }

  onMove(e: ToolPointerEvent): void {
    if (!this.startImage || !this.startScreen) return;
    if (Math.hypot(e.screenPos.x - this.startScreen.x, e.screenPos.y - this.startScreen.y) >= 3) {
      this.movedFarEnough = true;
    }
    this.currentRect = normalizeSelectionRect(this.startImage, e.imagePos, e.shiftKey);
  }

  onUp(e: ToolPointerEvent, ctx: ToolContext): void {
    if (!this.startImage || !this.startScreen) {
      this.reset();
      return;
    }
    const finalRect = normalizeSelectionRect(this.startImage, e.imagePos, e.shiftKey);
    const dragged =
      this.movedFarEnough ||
      Math.hypot(e.screenPos.x - this.startScreen.x, e.screenPos.y - this.startScreen.y) >= 3;
    const combineMode = ctx.getEditor().selectionTools.combineMode;

    this.reset();

    if (!ctx.registry.isAllocated) return;
    if (!dragged || finalRect.w < 1 || finalRect.h < 1) {
      if (combineMode === 'replace' && ctx.registry.hasSelection) {
        clearSelection();
      }
      return;
    }

    const mask = createRectSelectionMask(ctx.registry.width, ctx.registry.height, finalRect);
    applyShapeSelection(mask, combineMode);
  }

  onCancel(): void {
    this.reset();
  }

  getOverlayPreview(): SelectionDraftPreview | null {
    if (!this.currentRect || this.currentRect.w <= 0 || this.currentRect.h <= 0) {
      return null;
    }
    return { kind: 'rect', rect: this.currentRect };
  }

  private reset(): void {
    this.startImage = null;
    this.startScreen = null;
    this.currentRect = null;
    this.movedFarEnough = false;
  }
}
