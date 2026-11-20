import { measureRulerLine } from '@/core/geometry/ruler';
import type { GridSettings, LineSegment, Rect, Vec2 } from '@/core/types';
import { computeRulerStepCm, formatGridCmLabel, generateGridLines } from '@/core/units/grid';
import { renderMarchingAntsOverlay } from '@/editor2d/selection/SelectionMask';
import {
  imagePxToScreen,
  screenToImagePx,
  type ViewportSize,
  type ViewTransformState,
} from '@/editor2d/viewTransform';
import type { GradientKind } from '@/imaging/gradient';

export const RULER_THICKNESS_PX = 20;

export type SelectionDraftPreview =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'ellipse'; rect: Rect }
  | { kind: 'lasso'; points: readonly Vec2[] }
  | { kind: 'stroke'; points: readonly Vec2[] }
  | { kind: 'gradient'; gradientKind: GradientKind; p0: Vec2; p1: Vec2 };

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
  canvasWidthCm: number;
  canvasHeightCm: number;
  transform: ViewTransformState;
  cursor: OverlayCursorState | null;
  grid?: GridSettings;
  showRulers?: boolean;
  rulerLine?: LineSegment | null;
  isRulerToolActive?: boolean;
  crossSectionLine?: LineSegment | null;
  crossSectionHoverT?: number | null;
  isCrossSectionToolActive?: boolean;
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

    // Draw 2D measurement grid overlay if enabled
    if (state.grid?.show2D && state.grid.opacity > 0.001) {
      this.renderMeasurementGrid(ctx, state, state.grid, topLeft, bottomRight);
    }

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

    // Draw active selection / gradient / stroke draft preview
    const draft = state.cursor?.selectionDraft;
    if (draft) {
      this.renderSelectionDraft(ctx, state, draft);
    }

    // Draw persistent cross-section cut line & optional synced hover marker
    if (state.crossSectionLine) {
      this.renderCrossSectionLine(
        ctx,
        state,
        state.crossSectionLine,
        state.crossSectionHoverT ?? null,
        Boolean(state.isCrossSectionToolActive),
      );
    }

    // Draw interactive measurement ruler line & badge
    if (state.rulerLine) {
      this.renderRulerMeasurement(ctx, state, state.rulerLine, Boolean(state.isRulerToolActive));
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

    // Draw calibrated cm edge rulers on top & left viewport edges
    if (state.showRulers) {
      this.renderEdgeRulers(ctx, state, topLeft, bottomRight);
    }

    ctx.restore();
  }

  private renderCrossSectionLine(
    ctx: CanvasRenderingContext2D,
    state: OverlayRenderState,
    line: LineSegment,
    hoverT: number | null,
    highlightHandles: boolean,
  ): void {
    const s0 = imagePxToScreen(
      state.transform,
      state.viewport,
      state.imageWidth,
      state.imageHeight,
      line.p0.x,
      line.p0.y,
    );
    const s1 = imagePxToScreen(
      state.transform,
      state.viewport,
      state.imageWidth,
      state.imageHeight,
      line.p1.x,
      line.p1.y,
    );

    ctx.save();

    // High-contrast dashed backing + amber section line
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(11, 11, 13, 0.9)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    const handleRadius = highlightHandles ? 5.5 : 4;
    const drawHandle = (pt: Vec2, tag: string) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(11, 11, 13, 0.95)';
      ctx.stroke();

      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(11, 11, 13, 0.85)';
      ctx.fillText(tag, pt.x + 1, pt.y - handleRadius - 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(tag, pt.x, pt.y - handleRadius - 3);
    };

    drawHandle(s0, 'A');
    drawHandle(s1, 'B');

    // Synced hover marker from SVG chart
    if (hoverT !== null && Number.isFinite(hoverT)) {
      const t = Math.min(1, Math.max(0, hoverT));
      const hx = s0.x + (s1.x - s0.x) * t;
      const hy = s0.y + (s1.y - s0.y) * t;

      ctx.beginPath();
      ctx.arc(hx, hy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(11, 11, 13, 0.95)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(hx, hy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.75;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f4f5';
      ctx.fill();
    }

    ctx.restore();
  }

  private renderRulerMeasurement(
    ctx: CanvasRenderingContext2D,
    state: OverlayRenderState,
    line: LineSegment,
    highlightHandles: boolean,
  ): void {
    const s0 = imagePxToScreen(
      state.transform,
      state.viewport,
      state.imageWidth,
      state.imageHeight,
      line.p0.x,
      line.p0.y,
    );
    const s1 = imagePxToScreen(
      state.transform,
      state.viewport,
      state.imageWidth,
      state.imageHeight,
      line.p1.x,
      line.p1.y,
    );

    const measurement = measureRulerLine(line, {
      widthCm: state.canvasWidthCm,
      heightCm: state.canvasHeightCm,
      widthPx: state.imageWidth,
      heightPx: state.imageHeight,
    });

    ctx.save();

    // Subtle orthogonal delta guides when the segment is diagonal
    if (Math.abs(s1.x - s0.x) > 10 && Math.abs(s1.y - s0.y) > 10) {
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // High-contrast measurement segment
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.lineWidth = 3.25;
    ctx.strokeStyle = 'rgba(11, 11, 13, 0.88)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Endpoint handles
    const handleRadius = highlightHandles ? 5.5 : 4;
    const drawHandle = (pt: Vec2) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(11, 11, 13, 0.95)';
      ctx.stroke();
    };
    drawHandle(s0);
    drawHandle(s1);

    // Floating badge near segment midpoint
    if (Math.hypot(s1.x - s0.x, s1.y - s0.y) >= 4) {
      const line1 = `${measurement.lengthCm.toFixed(2)} cm · ${Math.round(measurement.lengthPx)} px (${measurement.lengthMm.toFixed(1)} mm)`;
      const line2 = `Δx ${measurement.dxCm.toFixed(2)}  Δy ${measurement.dyCm.toFixed(2)} cm  ${measurement.angleDeg.toFixed(1)}°`;

      ctx.font = '11px "JetBrains Mono", monospace';
      const w1 = ctx.measureText(line1).width;
      ctx.font = '10px "JetBrains Mono", monospace';
      const w2 = ctx.measureText(line2).width;

      const padX = 8;
      const boxW = Math.ceil(Math.max(w1, w2)) + padX * 2;
      const boxH = 34;

      const minMarginX = (state.showRulers ? RULER_THICKNESS_PX : 0) + 8;
      const minMarginY = (state.showRulers ? RULER_THICKNESS_PX : 0) + 8;
      const midX = (s0.x + s1.x) / 2;
      const midY = (s0.y + s1.y) / 2;

      const maxBoxX = Math.max(minMarginX, state.viewport.width - boxW - 8);
      const maxBoxY = Math.max(minMarginY, state.viewport.height - boxH - 8);
      const boxX = Math.min(maxBoxX, Math.max(minMarginX, Math.round(midX - boxW / 2)));
      const boxY = Math.min(maxBoxY, Math.max(minMarginY, Math.round(midY - boxH - 12)));

      ctx.fillStyle = 'rgba(11, 11, 13, 0.88)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1;
      ctx.fillRect(boxX + 0.5, boxY + 0.5, boxW, boxH);
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW, boxH);

      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#f4f4f5';
      ctx.fillText(line1, boxX + padX, boxY + 4);

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(line2, boxX + padX, boxY + 18);
    }

    ctx.restore();
  }

  private renderMeasurementGrid(
    ctx: CanvasRenderingContext2D,
    state: OverlayRenderState,
    grid: GridSettings,
    topLeft: Vec2,
    bottomRight: Vec2,
  ): void {
    const generated = generateGridLines(
      {
        widthCm: state.canvasWidthCm,
        heightCm: state.canvasHeightCm,
        widthPx: state.imageWidth,
        heightPx: state.imageHeight,
      },
      grid,
    );

    const x0 = topLeft.x;
    const y0 = topLeft.y;
    const x1 = bottomRight.x;
    const y1 = bottomRight.y;
    const spanW = x1 - x0;
    const spanH = y1 - y0;
    if (spanW < 2 || spanH < 2) return;

    const pxPerCmX = state.imageWidth / Math.max(1e-3, state.canvasWidthCm);
    const pxPerCmY = state.imageHeight / Math.max(1e-3, state.canvasHeightCm);
    const majorScreenX = generated.majorSpacingCm * pxPerCmX * state.transform.zoom;
    const majorScreenY = generated.majorSpacingCm * pxPerCmY * state.transform.zoom;
    const minorScreenX = generated.minorSpacingCm * pxPerCmX * state.transform.zoom;
    const minorScreenY = generated.minorSpacingCm * pxPerCmY * state.transform.zoom;

    const baseOpacity = Math.max(0, Math.min(1, grid.opacity));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, spanW, spanH);
    ctx.clip();

    ctx.strokeStyle = grid.color;
    ctx.lineWidth = 1;

    // Minor subdivision lines
    if (generated.subdivisions > 1 && minorScreenX >= 4 && minorScreenY >= 4) {
      ctx.globalAlpha = baseOpacity * 0.42;
      ctx.beginPath();
      for (const line of generated.vertical) {
        if (line.isMajor) continue;
        const sx =
          Math.round(
            imagePxToScreen(
              state.transform,
              state.viewport,
              state.imageWidth,
              state.imageHeight,
              line.positionPx,
              0,
            ).x,
          ) + 0.5;
        ctx.moveTo(sx, y0);
        ctx.lineTo(sx, y1);
      }
      for (const line of generated.horizontal) {
        if (line.isMajor) continue;
        const sy =
          Math.round(
            imagePxToScreen(
              state.transform,
              state.viewport,
              state.imageWidth,
              state.imageHeight,
              0,
              line.positionPx,
            ).y,
          ) + 0.5;
        ctx.moveTo(x0, sy);
        ctx.lineTo(x1, sy);
      }
      ctx.stroke();
    }

    // Major lines
    if (majorScreenX >= 3 && majorScreenY >= 3) {
      ctx.globalAlpha = baseOpacity;
      ctx.beginPath();
      for (const line of generated.vertical) {
        if (!line.isMajor) continue;
        const sx =
          Math.round(
            imagePxToScreen(
              state.transform,
              state.viewport,
              state.imageWidth,
              state.imageHeight,
              line.positionPx,
              0,
            ).x,
          ) + 0.5;
        ctx.moveTo(sx, y0);
        ctx.lineTo(sx, y1);
      }
      for (const line of generated.horizontal) {
        if (!line.isMajor) continue;
        const sy =
          Math.round(
            imagePxToScreen(
              state.transform,
              state.viewport,
              state.imageWidth,
              state.imageHeight,
              0,
              line.positionPx,
            ).y,
          ) + 0.5;
        ctx.moveTo(x0, sy);
        ctx.lineTo(x1, sy);
      }
      ctx.stroke();

      if (grid.labels && majorScreenX >= 22 && majorScreenY >= 18) {
        const minTop = state.showRulers ? RULER_THICKNESS_PX + 2 : 2;
        const minLeft = state.showRulers ? RULER_THICKNESS_PX + 2 : 2;
        const labelY = Math.max(y0 + 3, minTop);
        const labelX = Math.max(x0 + 3, minLeft);

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = Math.min(1, Math.max(0.65, baseOpacity + 0.35));

        const drawPillLabel = (text: string, px: number, py: number) => {
          const metrics = ctx.measureText(text);
          const padX = 2;
          const w = Math.ceil(metrics.width) + padX * 2;
          const h = 12;
          ctx.fillStyle = 'rgba(11, 11, 13, 0.72)';
          ctx.fillRect(px, py, w, h);
          ctx.fillStyle = grid.color;
          ctx.fillText(text, px + padX, py + 1);
        };

        for (const line of generated.vertical) {
          if (!line.isMajor || !line.label) continue;
          const sx = imagePxToScreen(
            state.transform,
            state.viewport,
            state.imageWidth,
            state.imageHeight,
            line.positionPx,
            0,
          ).x;
          if (sx + 24 > x1 || sx < x0 - 2) continue;
          drawPillLabel(line.label, sx + 3, labelY);
        }

        for (const line of generated.horizontal) {
          if (!line.isMajor || !line.label || line.index === 0) continue;
          const sy = imagePxToScreen(
            state.transform,
            state.viewport,
            state.imageWidth,
            state.imageHeight,
            0,
            line.positionPx,
          ).y;
          if (sy + 14 > y1 || sy < y0 - 2) continue;
          drawPillLabel(line.label, labelX, sy + 2);
        }
      }
    }

    ctx.restore();
  }

  private renderEdgeRulers(
    ctx: CanvasRenderingContext2D,
    state: OverlayRenderState,
    topLeft: Vec2,
    bottomRight: Vec2,
  ): void {
    const { viewport, imageWidth, imageHeight, canvasWidthCm, canvasHeightCm, transform } = state;
    if (viewport.width <= RULER_THICKNESS_PX || viewport.height <= RULER_THICKNESS_PX) return;

    const pxPerCmX = imageWidth / Math.max(1e-3, canvasWidthCm);
    const pxPerCmY = imageHeight / Math.max(1e-3, canvasHeightCm);
    const step = computeRulerStepCm(transform.zoom, Math.max(pxPerCmX, pxPerCmY));

    ctx.save();

    // Ruler backgrounds
    ctx.fillStyle = 'rgba(21, 21, 24, 0.92)';
    ctx.fillRect(RULER_THICKNESS_PX, 0, viewport.width - RULER_THICKNESS_PX, RULER_THICKNESS_PX);
    ctx.fillRect(0, RULER_THICKNESS_PX, RULER_THICKNESS_PX, viewport.height - RULER_THICKNESS_PX);

    // Canvas span tint along top & left rulers
    const spanLeft = Math.max(RULER_THICKNESS_PX, topLeft.x);
    const spanRight = Math.min(viewport.width, bottomRight.x);
    if (spanRight > spanLeft) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fillRect(spanLeft, 0, spanRight - spanLeft, RULER_THICKNESS_PX);
    }

    const spanTop = Math.max(RULER_THICKNESS_PX, topLeft.y);
    const spanBottom = Math.min(viewport.height, bottomRight.y);
    if (spanBottom > spanTop) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fillRect(0, spanTop, RULER_THICKNESS_PX, spanBottom - spanTop);
    }

    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';

    const minorStepCm = step.majorCm / step.minorDivisions;

    // Top horizontal ruler ticks
    const minVisiblePxX = screenToImagePx(
      transform,
      viewport,
      imageWidth,
      imageHeight,
      RULER_THICKNESS_PX,
      0,
    ).x;
    const maxVisiblePxX = screenToImagePx(
      transform,
      viewport,
      imageWidth,
      imageHeight,
      viewport.width,
      0,
    ).x;
    const minCmX = Math.floor(minVisiblePxX / pxPerCmX / minorStepCm) - 1;
    const maxCmX = Math.ceil(maxVisiblePxX / pxPerCmX / minorStepCm) + 1;

    ctx.lineWidth = 1;
    for (let k = minCmX; k <= maxCmX; k++) {
      const isMajor = ((k % step.minorDivisions) + step.minorDivisions) % step.minorDivisions === 0;
      const cm = k * minorStepCm;
      const sx = imagePxToScreen(transform, viewport, imageWidth, imageHeight, cm * pxPerCmX, 0).x;
      if (sx < RULER_THICKNESS_PX || sx > viewport.width) continue;

      const xAligned = Math.round(sx) + 0.5;
      const insideCanvas = cm >= -1e-4 && cm <= canvasWidthCm + 1e-4;
      ctx.strokeStyle = isMajor
        ? insideCanvas
          ? 'rgba(228, 228, 231, 0.75)'
          : 'rgba(161, 161, 170, 0.45)'
        : 'rgba(161, 161, 170, 0.3)';

      const tickH = isMajor ? 9 : 4;
      ctx.beginPath();
      ctx.moveTo(xAligned, RULER_THICKNESS_PX - tickH);
      ctx.lineTo(xAligned, RULER_THICKNESS_PX);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = insideCanvas ? '#e4e4e7' : '#a1a1aa';
        ctx.fillText(formatGridCmLabel(cm), sx + 2, 2);
      }
    }

    // Left vertical ruler ticks
    const minVisiblePxY = screenToImagePx(
      transform,
      viewport,
      imageWidth,
      imageHeight,
      0,
      RULER_THICKNESS_PX,
    ).y;
    const maxVisiblePxY = screenToImagePx(
      transform,
      viewport,
      imageWidth,
      imageHeight,
      0,
      viewport.height,
    ).y;
    const minCmY = Math.floor(minVisiblePxY / pxPerCmY / minorStepCm) - 1;
    const maxCmY = Math.ceil(maxVisiblePxY / pxPerCmY / minorStepCm) + 1;

    for (let k = minCmY; k <= maxCmY; k++) {
      const isMajor = ((k % step.minorDivisions) + step.minorDivisions) % step.minorDivisions === 0;
      const cm = k * minorStepCm;
      const sy = imagePxToScreen(transform, viewport, imageWidth, imageHeight, 0, cm * pxPerCmY).y;
      if (sy < RULER_THICKNESS_PX || sy > viewport.height) continue;

      const yAligned = Math.round(sy) + 0.5;
      const insideCanvas = cm >= -1e-4 && cm <= canvasHeightCm + 1e-4;
      ctx.strokeStyle = isMajor
        ? insideCanvas
          ? 'rgba(228, 228, 231, 0.75)'
          : 'rgba(161, 161, 170, 0.45)'
        : 'rgba(161, 161, 170, 0.3)';

      const tickW = isMajor ? 9 : 4;
      ctx.beginPath();
      ctx.moveTo(RULER_THICKNESS_PX - tickW, yAligned);
      ctx.lineTo(RULER_THICKNESS_PX, yAligned);
      ctx.stroke();

      if (isMajor) {
        ctx.save();
        ctx.translate(2, sy + 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = insideCanvas ? '#e4e4e7' : '#a1a1aa';
        ctx.fillText(formatGridCmLabel(cm), 0, 0);
        ctx.restore();
      }
    }

    // Cursor position marker on rulers
    if (state.cursor) {
      const cx = Math.round(state.cursor.screenPos.x) + 0.5;
      const cy = Math.round(state.cursor.screenPos.y) + 0.5;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.25;
      if (cx >= RULER_THICKNESS_PX && cx <= viewport.width) {
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, RULER_THICKNESS_PX);
        ctx.stroke();
      }
      if (cy >= RULER_THICKNESS_PX && cy <= viewport.height) {
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(RULER_THICKNESS_PX, cy);
        ctx.stroke();
      }
    }

    // Ruler borders & corner box
    ctx.fillStyle = '#151518';
    ctx.fillRect(0, 0, RULER_THICKNESS_PX, RULER_THICKNESS_PX);
    ctx.strokeStyle = '#26262b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_THICKNESS_PX - 0.5);
    ctx.lineTo(viewport.width, RULER_THICKNESS_PX - 0.5);
    ctx.moveTo(RULER_THICKNESS_PX - 0.5, 0);
    ctx.lineTo(RULER_THICKNESS_PX - 0.5, viewport.height);
    ctx.stroke();

    ctx.fillStyle = '#a1a1aa';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('cm', RULER_THICKNESS_PX / 2, RULER_THICKNESS_PX / 2);

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
    } else if (draft.kind === 'gradient') {
      const s0 = imagePxToScreen(
        state.transform,
        state.viewport,
        state.imageWidth,
        state.imageHeight,
        draft.p0.x,
        draft.p0.y,
      );
      const s1 = imagePxToScreen(
        state.transform,
        state.viewport,
        state.imageWidth,
        state.imageHeight,
        draft.p1.x,
        draft.p1.y,
      );
      const radiusScreen = Math.hypot(s1.x - s0.x, s1.y - s0.y);
      if (draft.gradientKind === 'radial' && radiusScreen >= 2) {
        strokeDual(() => {
          ctx.arc(s0.x, s0.y, radiusScreen, 0, Math.PI * 2);
        });
      }
      strokeDual(() => {
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
      });

      const drawHandle = (pt: Vec2, fill: string) => {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(11, 11, 13, 0.95)';
        ctx.stroke();
      };
      drawHandle(s0, '#f59e0b');
      drawHandle(s1, '#38bdf8');
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
        if (draft.kind === 'lasso') {
          ctx.closePath();
        }
      });
    }

    ctx.restore();
  }
}
