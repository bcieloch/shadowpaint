import type { Vec2 } from '@/core/types';
import {
  imagePxToScreen,
  type ViewportSize,
  type ViewTransformState,
} from '@/editor2d/viewTransform';

export interface OverlayCursorState {
  screenPos: Vec2;
  imagePos: Vec2;
  radiusPx?: number;
}

export interface OverlayRenderState {
  viewport: ViewportSize;
  imageWidth: number;
  imageHeight: number;
  transform: ViewTransformState;
  cursor: OverlayCursorState | null;
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
}
