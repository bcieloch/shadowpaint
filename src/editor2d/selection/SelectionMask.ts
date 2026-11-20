import { computeHasSelection, type MapRegistry } from '@/core/maps/MapRegistry';
import type { Rect, SelectionMode } from '@/core/types';
import { computeBrushFalloff, computeDabBounds } from '@/editor2d/brush/dab';
import {
  imagePxToScreen,
  screenToImagePx,
  type ViewportSize,
  type ViewTransformState,
} from '@/editor2d/viewTransform';

export interface SelectionMaskConfig {
  data: Uint8Array;
  mode: SelectionMode;
  active: boolean;
}

/**
 * Returns edit multiplier [0..1] for a pixel given the selection mask and mode.
 * When no selection is active, all pixels have full edit weight (1).
 */
export function getSelectionMaskWeight(
  mask: Uint8Array,
  pixelIndex: number,
  mode: SelectionMode,
  hasSelection: boolean,
): number {
  if (!hasSelection) return 1;
  const raw = (mask[pixelIndex] ?? 0) / 255;
  return mode === 'protect' ? 1 - raw : raw;
}

export function createSelectionMaskConfig(
  registry: MapRegistry,
  mode: SelectionMode,
): SelectionMaskConfig | undefined {
  if (!registry.isAllocated || !registry.hasSelection) {
    return undefined;
  }
  return {
    data: registry.selection,
    mode,
    active: true,
  };
}

export function stampMaskDab(
  registry: MapRegistry,
  params: {
    cx: number;
    cy: number;
    radiusPx: number;
    hardness: number;
    flow: number;
    erase: boolean;
  },
): Rect | null {
  if (!registry.isAllocated) return null;
  const width = registry.width;
  const height = registry.height;
  const radius = Math.max(0.5, params.radiusPx);
  const flow = Math.max(0, Math.min(1, params.flow));
  if (flow <= 0) return null;

  const bounds = computeDabBounds(params.cx, params.cy, radius, width, height);
  if (!bounds) return null;

  const mask = registry.selection;
  const targetVal = params.erase ? 0 : 255;
  const isSinglePixel = radius < 1;
  const singlePxX = Math.floor(params.cx);
  const singlePxY = Math.floor(params.cy);

  const x0 = bounds.x;
  const y0 = bounds.y;
  const x1 = bounds.x + bounds.w;
  const y1 = bounds.y + bounds.h;

  for (let y = y0; y < y1; y++) {
    const rowOff = y * width;
    for (let x = x0; x < x1; x++) {
      let falloff: number;
      if (isSinglePixel) {
        falloff = x === singlePxX && y === singlePxY ? 1 : 0;
      } else {
        const dx = x + 0.5 - params.cx;
        const dy = y + 0.5 - params.cy;
        falloff = computeBrushFalloff(Math.hypot(dx, dy), radius, params.hardness);
      }
      if (falloff <= 0) continue;
      const alpha = Math.min(1, falloff * flow);
      if (alpha <= 0) continue;

      const idx = rowOff + x;
      const cur = mask[idx] ?? 0;
      mask[idx] = Math.max(0, Math.min(255, Math.round(cur + (targetVal - cur) * alpha)));
    }
  }

  return bounds;
}

export class SelectionMask {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  mode: SelectionMode;

  constructor(width: number, height: number, mode: SelectionMode = 'protect', data?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.mode = mode;
    this.data = data ?? new Uint8Array(width * height);
  }

  hasSelection(): boolean {
    return computeHasSelection(this.data);
  }

  getWeight(x: number, y: number, hasSelection = this.hasSelection()): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return getSelectionMaskWeight(this.data, y * this.width + x, this.mode, hasSelection);
  }
}

/**
 * Renders animated marching-ants selection contours onto the 2D overlay canvas.
 * Sampling operates in visible viewport space so frame cost stays bounded even on 3000x4200 maps.
 */
export function renderMarchingAntsOverlay(
  ctx: CanvasRenderingContext2D,
  options: {
    mask: Uint8Array;
    imageWidth: number;
    imageHeight: number;
    viewport: ViewportSize;
    transform: ViewTransformState;
    phasePx: number;
    tintRedOverlay?: boolean;
  },
): void {
  const { mask, imageWidth, imageHeight, viewport, transform, phasePx, tintRedOverlay } = options;
  if (imageWidth <= 0 || imageHeight <= 0 || viewport.width <= 0 || viewport.height <= 0) return;

  const topLeft = imagePxToScreen(transform, viewport, imageWidth, imageHeight, 0, 0);
  const bottomRight = imagePxToScreen(
    transform,
    viewport,
    imageWidth,
    imageHeight,
    imageWidth,
    imageHeight,
  );

  const sx0 = Math.max(0, Math.floor(topLeft.x));
  const sy0 = Math.max(0, Math.floor(topLeft.y));
  const sx1 = Math.min(Math.ceil(viewport.width), Math.ceil(bottomRight.x));
  const sy1 = Math.min(Math.ceil(viewport.height), Math.ceil(bottomRight.y));
  const rw = sx1 - sx0;
  const rh = sy1 - sy0;
  if (rw <= 1 || rh <= 1) return;

  // Step 2 CSS px for crisp, fast viewport-resolution boundary extraction
  const step = 2;
  const gw = Math.ceil(rw / step);
  const gh = Math.ceil(rh / step);
  const binary = new Uint8Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    const sy = sy0 + gy * step + 0.5;
    const rowOff = gy * gw;
    for (let gx = 0; gx < gw; gx++) {
      const sx = sx0 + gx * step + 0.5;
      const img = screenToImagePx(transform, viewport, imageWidth, imageHeight, sx, sy);
      const ix = Math.floor(img.x);
      const iy = Math.floor(img.y);
      if (ix >= 0 && ix < imageWidth && iy >= 0 && iy < imageHeight) {
        binary[rowOff + gx] = (mask[iy * imageWidth + ix] ?? 0) >= 128 ? 1 : 0;
      }
    }
  }

  if (tintRedOverlay) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.24)';
    for (let gy = 0; gy < gh; gy++) {
      const rowOff = gy * gw;
      for (let gx = 0; gx < gw; gx++) {
        if (binary[rowOff + gx] === 1) {
          ctx.fillRect(sx0 + gx * step, sy0 + gy * step, step, step);
        }
      }
    }
  }

  const buildBoundaryPath = () => {
    ctx.beginPath();
    for (let gy = 0; gy < gh; gy++) {
      const rowOff = gy * gw;
      const py = sy0 + gy * step;
      for (let gx = 0; gx < gw; gx++) {
        const cur = binary[rowOff + gx] ?? 0;
        const px = sx0 + gx * step;

        const left = gx > 0 ? (binary[rowOff + gx - 1] ?? 0) : 0;
        if (cur !== left) {
          ctx.moveTo(px + 0.5, py);
          ctx.lineTo(px + 0.5, py + step);
        }
        const top = gy > 0 ? (binary[(gy - 1) * gw + gx] ?? 0) : 0;
        if (cur !== top) {
          ctx.moveTo(px, py + 0.5);
          ctx.lineTo(px + step, py + 0.5);
        }
      }
      if (binary[rowOff + gw - 1] === 1) {
        const px = sx0 + gw * step;
        ctx.moveTo(px + 0.5, py);
        ctx.lineTo(px + 0.5, py + step);
      }
    }
    const lastRow = (gh - 1) * gw;
    const pyBottom = sy0 + gh * step;
    for (let gx = 0; gx < gw; gx++) {
      if (binary[lastRow + gx] === 1) {
        const px = sx0 + gx * step;
        ctx.moveTo(px, pyBottom + 0.5);
        ctx.lineTo(px + step, pyBottom + 0.5);
      }
    }
  };

  ctx.save();
  ctx.lineWidth = 1;
  buildBoundaryPath();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.setLineDash([]);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -(phasePx % 8);
  ctx.stroke();
  ctx.restore();
}
