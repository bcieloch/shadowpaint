import type { FitMode, ImportTransform, Rect } from '@/core/types';

export function createDefaultTransform(srcWidth: number, srcHeight: number): ImportTransform {
  return {
    scale: 1,
    offsetXPx: 0,
    offsetYPx: 0,
    rotate90: 0,
    flipH: false,
    flipV: false,
    crop: { x: 0, y: 0, w: srcWidth, h: srcHeight },
  };
}

export interface ComputedTransformScales {
  effW: number;
  effH: number;
  scaleX: number;
  scaleY: number;
  crop: Rect;
}

export function getEffectiveCropSize(
  crop: Rect,
  rotate90: 0 | 1 | 2 | 3,
): { effW: number; effH: number } {
  return rotate90 % 2 === 0
    ? { effW: crop.w, effH: crop.h }
    : { effW: crop.h, effH: crop.w };
}

export function computeTransformScales(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
  fit: FitMode,
  transform: ImportTransform,
): ComputedTransformScales {
  const crop: Rect = {
    x: Math.max(0, Math.min(srcWidth, transform.crop.x)),
    y: Math.max(0, Math.min(srcHeight, transform.crop.y)),
    w: Math.max(1, Math.min(srcWidth - Math.max(0, transform.crop.x), transform.crop.w)),
    h: Math.max(1, Math.min(srcHeight - Math.max(0, transform.crop.y), transform.crop.h)),
  };

  const { effW, effH } = getEffectiveCropSize(crop, transform.rotate90);

  let baseScaleX: number;
  let baseScaleY: number;
  if (fit === 'fit') {
    const s = Math.min(dstWidth / effW, dstHeight / effH);
    baseScaleX = s;
    baseScaleY = s;
  } else if (fit === 'fill') {
    const s = Math.max(dstWidth / effW, dstHeight / effH);
    baseScaleX = s;
    baseScaleY = s;
  } else {
    baseScaleX = dstWidth / effW;
    baseScaleY = dstHeight / effH;
  }

  return {
    effW,
    effH,
    scaleX: baseScaleX * transform.scale,
    scaleY: baseScaleY * transform.scale,
    crop,
  };
}

export function mapDstPixelToSrc(
  dstX: number,
  dstY: number,
  dstWidth: number,
  dstHeight: number,
  transform: ImportTransform,
  scales: ComputedTransformScales,
): { srcX: number; srcY: number; inside: boolean } {
  const { effW, effH, scaleX, scaleY, crop } = scales;

  let u = (dstX + 0.5 - dstWidth / 2 - transform.offsetXPx) / scaleX + effW / 2;
  let v = (dstY + 0.5 - dstHeight / 2 - transform.offsetYPx) / scaleY + effH / 2;

  if (transform.flipH) u = effW - u;
  if (transform.flipV) v = effH - v;

  let rx: number;
  let ry: number;
  switch (transform.rotate90) {
    case 0:
      rx = u;
      ry = v;
      break;
    case 1:
      rx = v;
      ry = crop.h - u;
      break;
    case 2:
      rx = crop.w - u;
      ry = crop.h - v;
      break;
    case 3:
      rx = crop.w - v;
      ry = u;
      break;
  }

  const inside = rx >= 0 && rx < crop.w && ry >= 0 && ry < crop.h;
  return {
    srcX: crop.x + rx - 0.5,
    srcY: crop.y + ry - 0.5,
    inside,
  };
}
