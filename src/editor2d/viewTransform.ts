import type { Vec2 } from '@/core/types';

export const MIN_ZOOM_2D = 0.03;
export const MAX_ZOOM_2D = 32;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewTransformState {
  zoom: number;
  panX: number;
  panY: number;
}

export function clampZoom2D(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(MIN_ZOOM_2D, Math.min(MAX_ZOOM_2D, zoom));
}

export function screenToImagePx(
  state: ViewTransformState,
  viewport: ViewportSize,
  imageWidth: number,
  imageHeight: number,
  screenX: number,
  screenY: number,
): Vec2 {
  const zoom = clampZoom2D(state.zoom);
  return {
    x: (screenX - viewport.width / 2 - state.panX) / zoom + imageWidth / 2,
    y: (screenY - viewport.height / 2 - state.panY) / zoom + imageHeight / 2,
  };
}

export function imagePxToScreen(
  state: ViewTransformState,
  viewport: ViewportSize,
  imageWidth: number,
  imageHeight: number,
  imgX: number,
  imgY: number,
): Vec2 {
  const zoom = clampZoom2D(state.zoom);
  return {
    x: viewport.width / 2 + state.panX + (imgX - imageWidth / 2) * zoom,
    y: viewport.height / 2 + state.panY + (imgY - imageHeight / 2) * zoom,
  };
}

export function zoomAtPoint(
  state: ViewTransformState,
  viewport: ViewportSize,
  imageWidth: number,
  imageHeight: number,
  cursorScreenX: number,
  cursorScreenY: number,
  nextZoomRaw: number,
): ViewTransformState {
  const nextZoom = clampZoom2D(nextZoomRaw);
  const imgPt = screenToImagePx(
    state,
    viewport,
    imageWidth,
    imageHeight,
    cursorScreenX,
    cursorScreenY,
  );
  return {
    zoom: nextZoom,
    panX: cursorScreenX - viewport.width / 2 - (imgPt.x - imageWidth / 2) * nextZoom,
    panY: cursorScreenY - viewport.height / 2 - (imgPt.y - imageHeight / 2) * nextZoom,
  };
}

export function fitToViewport(
  viewport: ViewportSize,
  imageWidth: number,
  imageHeight: number,
  paddingPx = 28,
): ViewTransformState {
  const availW = Math.max(16, viewport.width - paddingPx * 2);
  const availH = Math.max(16, viewport.height - paddingPx * 2);
  const zoom = clampZoom2D(Math.min(availW / Math.max(1, imageWidth), availH / Math.max(1, imageHeight)));
  return { zoom, panX: 0, panY: 0 };
}

export function zoom100(viewport?: ViewportSize): ViewTransformState {
  void viewport;
  return { zoom: 1, panX: 0, panY: 0 };
}
