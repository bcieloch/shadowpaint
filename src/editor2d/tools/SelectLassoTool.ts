import type { Vec2 } from '@/core/types';
import type { SelectionDraftPreview } from '@/editor2d/overlay/OverlayRenderer';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { createLassoSelectionMask } from '@/imaging/selectionOps';
import { applyShapeSelection, clearSelection } from '@/services/selectionService';

export class SelectLassoTool implements Tool {
  readonly id = 'selectLasso' as const;
  private points: Vec2[] = [];
  private lastScreen: Vec2 | null = null;

  onDown(e: ToolPointerEvent): void {
    this.points = [{ ...e.imagePos }];
    this.lastScreen = { ...e.screenPos };
  }

  onMove(e: ToolPointerEvent): void {
    if (this.points.length === 0 || !this.lastScreen) return;
    const distScreen = Math.hypot(
      e.screenPos.x - this.lastScreen.x,
      e.screenPos.y - this.lastScreen.y,
    );
    if (distScreen >= 3) {
      this.points.push({ ...e.imagePos });
      this.lastScreen = { ...e.screenPos };
    }
  }

  onUp(e: ToolPointerEvent, ctx: ToolContext): void {
    const polygon = [...this.points, { ...e.imagePos }];
    const combineMode = ctx.getEditor().selectionTools.combineMode;
    this.reset();

    if (!ctx.registry.isAllocated) return;
    if (polygon.length < 3) {
      if (combineMode === 'replace' && ctx.registry.hasSelection) {
        clearSelection();
      }
      return;
    }

    const mask = createLassoSelectionMask(ctx.registry.width, ctx.registry.height, polygon);
    applyShapeSelection(mask, combineMode);
  }

  onCancel(): void {
    this.reset();
  }

  getOverlayPreview(): SelectionDraftPreview | null {
    if (this.points.length < 2) return null;
    return { kind: 'lasso', points: this.points };
  }

  private reset(): void {
    this.points = [];
    this.lastScreen = null;
  }
}
