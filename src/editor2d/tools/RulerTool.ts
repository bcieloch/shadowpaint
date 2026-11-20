import { snapSegment15Deg } from '@/core/geometry/ruler';
import type { LineSegment, Vec2 } from '@/core/types';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';

type DragMode = 'new' | 'p0' | 'p1';

const ENDPOINT_HIT_RADIUS_SCREEN_PX = 12;

function updateRuler(ctx: ToolContext, line: LineSegment | null): void {
  if (ctx.setRulerLine) {
    ctx.setRulerLine(line);
  } else {
    ctx.getEditor().setRulerLine(line);
  }
}

export class RulerTool implements Tool {
  readonly id = 'ruler' as const;
  private active = false;
  private dragMode: DragMode = 'new';
  private anchor: Vec2 = { x: 0, y: 0 };

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    const editor = ctx.getEditor();
    const existing = editor.rulerLine;
    const zoom = ctx.getZoom?.() ?? editor.pane2D.zoom;
    const hitRadiusImg = ENDPOINT_HIT_RADIUS_SCREEN_PX / Math.max(0.05, zoom);

    if (existing) {
      const d0 = Math.hypot(e.imagePos.x - existing.p0.x, e.imagePos.y - existing.p0.y);
      const d1 = Math.hypot(e.imagePos.x - existing.p1.x, e.imagePos.y - existing.p1.y);
      if (d0 <= hitRadiusImg && d0 <= d1) {
        this.active = true;
        this.dragMode = 'p0';
        this.anchor = { ...existing.p1 };
        const p0 = e.shiftKey
          ? snapSegment15Deg(this.anchor, e.imagePos)
          : { x: e.imagePos.x, y: e.imagePos.y };
        updateRuler(ctx, { p0, p1: { ...this.anchor } });
        return;
      }
      if (d1 <= hitRadiusImg) {
        this.active = true;
        this.dragMode = 'p1';
        this.anchor = { ...existing.p0 };
        const p1 = e.shiftKey
          ? snapSegment15Deg(this.anchor, e.imagePos)
          : { x: e.imagePos.x, y: e.imagePos.y };
        updateRuler(ctx, { p0: { ...this.anchor }, p1 });
        return;
      }
    }

    this.active = true;
    this.dragMode = 'new';
    this.anchor = { x: e.imagePos.x, y: e.imagePos.y };
    updateRuler(ctx, {
      p0: { ...this.anchor },
      p1: { ...this.anchor },
    });
  }

  onMove(e: ToolPointerEvent, ctx: ToolContext): void {
    if (!this.active) return;
    const nextPt = e.shiftKey
      ? snapSegment15Deg(this.anchor, e.imagePos)
      : { x: e.imagePos.x, y: e.imagePos.y };
    if (this.dragMode === 'p0') {
      updateRuler(ctx, { p0: nextPt, p1: { ...this.anchor } });
    } else {
      updateRuler(ctx, { p0: { ...this.anchor }, p1: nextPt });
    }
  }

  onUp(e: ToolPointerEvent, ctx: ToolContext): void {
    if (!this.active) return;
    const nextPt = e.shiftKey
      ? snapSegment15Deg(this.anchor, e.imagePos)
      : { x: e.imagePos.x, y: e.imagePos.y };
    const mode = this.dragMode;
    this.active = false;

    if (mode === 'new' && Math.hypot(nextPt.x - this.anchor.x, nextPt.y - this.anchor.y) < 1) {
      updateRuler(ctx, null);
      return;
    }

    if (mode === 'p0') {
      updateRuler(ctx, { p0: nextPt, p1: { ...this.anchor } });
    } else {
      updateRuler(ctx, { p0: { ...this.anchor }, p1: nextPt });
    }
  }

  onCancel(): void {
    this.active = false;
  }
}
