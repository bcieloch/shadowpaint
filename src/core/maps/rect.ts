import type { Rect } from '@/core/types';

export function isEmptyRect(r: Rect): boolean {
  return r.w <= 0 || r.h <= 0;
}

export function rectArea(r: Rect): number {
  return isEmptyRect(r) ? 0 : r.w * r.h;
}

export function clampRect(r: Rect, width: number, height: number): Rect {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(width, Math.ceil(r.x + r.w));
  const y1 = Math.min(height, Math.ceil(r.y + r.h));
  return {
    x: x0,
    y: y0,
    w: Math.max(0, x1 - x0),
    h: Math.max(0, y1 - y0),
  };
}

export function intersectRect(a: Rect, b: Rect): Rect {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return {
    x: x0,
    y: y0,
    w: Math.max(0, x1 - x0),
    h: Math.max(0, y1 - y0),
  };
}

export function unionRect(a: Rect, b: Rect): Rect {
  if (isEmptyRect(a)) return { ...b };
  if (isEmptyRect(b)) return { ...a };
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return {
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
  };
}

export function expandRect(r: Rect, margin: number): Rect {
  return {
    x: r.x - margin,
    y: r.y - margin,
    w: r.w + margin * 2,
    h: r.h + margin * 2,
  };
}
