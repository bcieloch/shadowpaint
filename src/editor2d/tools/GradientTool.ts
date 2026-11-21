import type { MapId, Vec2 } from '@/core/types';
import type { SelectionDraftPreview } from '@/editor2d/overlay/OverlayRenderer';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import type { GradientKind } from '@/imaging/gradient';
import { applyGradientToActiveMap } from '@/services/filterService';

function snapPoint15Deg(p0: Vec2, p1: Vec2): Vec2 {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return p1;
  const step = Math.PI / 12; // 15 deg
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: p0.x + Math.cos(angle) * len,
    y: p0.y + Math.sin(angle) * len,
  };
}

export class GradientTool implements Tool {
  readonly id = 'gradient' as const;
  private active = false;
  private lockedWarned = false;
  private activeMap: MapId = 'height';
  private gradientKind: GradientKind = 'linear';
  private p0: Vec2 = { x: 0, y: 0 };
  private p1: Vec2 = { x: 0, y: 0 };

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    const project = ctx.getProject();
    const { activeMap, gradientTool } = ctx.getEditor();
    if (
      project.maps[activeMap].locked ||
      (ctx.registry.isAllocated && ctx.registry.getMap(activeMap).activeLayer.locked)
    ) {
      this.lockedWarned = true;
      ctx.onLockedMapAttempt(activeMap);
      return;
    }
    if (!ctx.registry.isAllocated) return;

    this.lockedWarned = false;
    this.active = true;
    this.activeMap = activeMap;
    this.gradientKind = gradientTool.kind;
    this.p0 = { x: e.imagePos.x, y: e.imagePos.y };
    this.p1 = { x: e.imagePos.x, y: e.imagePos.y };
  }

  onMove(e: ToolPointerEvent): void {
    if (this.lockedWarned || !this.active) return;
    this.p1 = e.shiftKey
      ? snapPoint15Deg(this.p0, e.imagePos)
      : { x: e.imagePos.x, y: e.imagePos.y };
  }

  onUp(e: ToolPointerEvent, ctx: ToolContext): void {
    const wasActive = this.active && !this.lockedWarned;
    const p0 = this.p0;
    const p1 = e.shiftKey ? snapPoint15Deg(p0, e.imagePos) : { x: e.imagePos.x, y: e.imagePos.y };
    const activeMap = this.activeMap;
    const kind = this.gradientKind;

    this.active = false;
    this.lockedWarned = false;

    if (!wasActive || !ctx.registry.isAllocated) return;
    if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1) return;

    void applyGradientToActiveMap({
      mapId: activeMap,
      kind,
      p0,
      p1,
    });
  }

  onCancel(): void {
    this.active = false;
    this.lockedWarned = false;
  }

  getOverlayPreview(): SelectionDraftPreview | null {
    if (!this.active) return null;
    return {
      kind: 'gradient',
      gradientKind: this.gradientKind,
      p0: this.p0,
      p1: this.p1,
    };
  }
}
