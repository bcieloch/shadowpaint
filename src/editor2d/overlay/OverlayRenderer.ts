import type { Rect, Vec2 } from '@/core/types';
import { renderMarchingAntsOverlay } from '@/editor2d/selection/SelectionMask';
import {
  imagePxToScreen,
  type ViewportSize,
  type ViewTransformState,
} from '@/editor2d/viewTransform';

export type SelectionDraftPreview =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'ellipse'; rect: Rect }
  | { kind: 'lasso'; points: readonly Vec2[] };

export interface OverlayCursorState {
  screenPos: Vec2;
  imagePos: Vec2;
  radiusPx?: number;
  selectionDraft?: SelectionDraftPreview | null;
}

export interface OverlayRenderState {
  viewport: ViewportSize;
  imageWidth: number;
  imageHeight: number;
  transform: ViewTransformState;
  cursor: OverlayCursorState | null;
  selectionMask?: Uint8Array | null;
  hasSelection?: boolean;
  marchingAntsPhasePx?: number;
  tintRedOverlay?: boolean;
}

export class OverlayRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private dpr = 1;
  private cssWidth = 1;
  private cssHeight = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(this.cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssHeight * this.dpr));
  }

  clear(): void {
    if (!this.ctx) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(state: OverlayRenderState): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.clear();
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Draw crisp 1px boundary around painting canvas
    const topLeft = imagePxToScreen(
      state.transform,
      state.viewport,
      state.imageWidth,
      state.imageHeight,
      0,
      0,
    );
    const bottomRight = imagePxToScreen(
      state.transform,
      state.viewport,
      state.imageWidth,
      state.imageHeight,
      state.imageWidth,
      state.imageHeight,
    );

    const rectX = Math.round(topLeft.x) + 0.5;
    const rectY = Math.round(topLeft.y) + 0.5;
    const rectW = Math.round(bottomRight.x - topLeft.x);
    const rectH = Math.round(bottomRight.y - topLeft.y);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rectX, rectY, rectW, rectH);

    // Draw selection marching ants and optional red mask overlay (e.g. lit 2D views)
    if (state.hasSelection && state.selectionMask && state.selectionMask.length > 0) {
      renderMarchingAntsOverlay(ctx, {
        mask: state.selectionMask,
        imageWidth: state.imageWidth,
        imageHeight: state.imageHeight,
        viewport: state.viewport,
        transform: state.transform,
        phasePx: state.marchingAntsPhasePx ?? 0,
        tintRedOverlay: state.tintRedOverlay,
      });
    }

    // Draw active selection tool drag preview
    const draft = state.cursor?.selectionDraft;
    if (draft) {
      this.renderSelectionDraft(ctx, state, draft);
    }

    // Draw cursor crosshair / optional radius ring when inside viewport
    if (state.cursor) {
      const { x, y } = state.cursor.screenPos;
      const rPx = state.cursor.radiusPx;

      if (rPx !== undefined && rPx * state.transform.zoom >= 3) {
        const radiusScreen = rPx * state.transform.zoom;
        ctx.beginPath();
        ctx.arc(x, y, radiusScreen, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }

      const arm = 6;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - arm, y);
      ctx.lineTo(x + arm, y);
      ctx.moveTo(x, y - arm);
      ctx.lineTo(x, y + arm);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderSelectionDraft(
    ctx: CanvasRenderingContext2D,
    state: OverlayRenderState,
    draft: SelectionDraftPreview,
  ): void {
    ctx.save();
    ctx.lineWidth = 1.25;

    const strokeDual = (drawPath: () => void) => {
      ctx.beginPath();
      drawPath();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.beginPath();
      drawPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.setLineDash([5, 4]);
      ctx.stroke();
    };

    if (draft.kind === 'rect') {
      const p0 = imagePxToScreen(
        state.transform,
        state.viewport,
        state.imageWidth,
        state.imageHeight,
        draft.rect.x,
        draft.rect.y,
      );
      const p1 = imagePxToScreen(
        state.transform,
        state.viewport,
        state.imageWidth,
        state.imageHeight,
        draft.rect.x + draft.rect.w,
        draft.rect.y + draft.rect.h,
      );
      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.abs(p1.x - p0.x);
      const h = Math.abs(p1.y - p0.y);
      strokeDual(() => {
        ctx.rect(x, y, w, h);
      });
    } else if (draft.kind === 'ellipse') {
      const p0 = imagePxToScreen(
        state.transform,
        state.viewport,
        state.imageWidth,
        state.imageHeight,
        draft.rect.x,
        draft.rect.y,
      );
      const p1 = imagePxToScreen(
        state.transform,
        state.viewport,
        state.imageWidth,
        state.imageHeight,
        draft.rect.x + draft.rect.w,
        draft.rect.y + draft.rect.h,
      );
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      const rx = Math.abs(p1.x - p0.x) / 2;
      const ry = Math.abs(p1.y - p0.y) / 2;
      if (rx > 0.5 && ry > 0.5) {
        strokeDual(() => {
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        });
      }
    } else if (draft.points.length >= 2) {
      strokeDual(() => {
        const first = draft.points[0];
        if (!first) return;
        const s0 = imagePxToScreen(
          state.transform,
          state.viewport,
          state.imageWidth,
          state.imageHeight,
          first.x,
          first.y,
        );
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < draft.points.length; i++) {
          const pt = draft.points[i];
          if (!pt) continue;
          const sp = imagePxToScreen(
            state.transform,
            state.viewport,
            state.imageWidth,
            state.imageHeight,
            pt.x,
            pt.y,
          );
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
      });
    }

    ctx.restore();
  }
}
