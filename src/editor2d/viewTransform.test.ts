import { describe, expect, it } from 'vitest';
import {
  fitToViewport,
  imagePxToScreen,
  MAX_ZOOM_2D,
  MIN_ZOOM_2D,
  screenToImagePx,
  zoom100,
  zoomAtPoint,
} from '@/editor2d/viewTransform';

describe('viewTransform', () => {
  const viewport = { width: 1000, height: 800 };

  it('round-trips screen <-> image coordinates accurately', () => {
    const state = { zoom: 2.5, panX: 42, panY: -18 };
    const imgPt = screenToImagePx(state, viewport, 3000, 4200, 613, 279);
    const back = imagePxToScreen(state, viewport, 3000, 4200, imgPt.x, imgPt.y);
    expect(back.x).toBeCloseTo(613, 8);
    expect(back.y).toBeCloseTo(279, 8);
  });

  it('preserves the image point under cursor when zooming at a point', () => {
    const initial = { zoom: 0.5, panX: -40, panY: 30 };
    const cursorX = 720;
    const cursorY = 240;
    const beforeImg = screenToImagePx(initial, viewport, 3000, 4200, cursorX, cursorY);

    const zoomed = zoomAtPoint(initial, viewport, 3000, 4200, cursorX, cursorY, 2.25);
    const afterImg = screenToImagePx(zoomed, viewport, 3000, 4200, cursorX, cursorY);

    expect(afterImg.x).toBeCloseTo(beforeImg.x, 6);
    expect(afterImg.y).toBeCloseTo(beforeImg.y, 6);
  });

  it('clamps zoom to [3%, 3200%]', () => {
    const tooLow = zoomAtPoint({ zoom: 1, panX: 0, panY: 0 }, viewport, 500, 500, 500, 400, 0.001);
    const tooHigh = zoomAtPoint({ zoom: 1, panX: 0, panY: 0 }, viewport, 500, 500, 500, 400, 99);
    expect(tooLow.zoom).toBe(MIN_ZOOM_2D);
    expect(tooHigh.zoom).toBe(MAX_ZOOM_2D);
  });

  it('fits image inside padded viewport and supports 1:1 reset', () => {
    const fitted = fitToViewport(viewport, 3000, 4200, 28);
    expect(fitted.panX).toBe(0);
    expect(fitted.panY).toBe(0);
    expect(fitted.zoom).toBeCloseTo((800 - 56) / 4200, 6);

    const oneToOne = zoom100(viewport);
    expect(oneToOne).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});
