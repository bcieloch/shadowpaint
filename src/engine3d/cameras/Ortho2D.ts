import * as THREE from 'three';
import type { CanvasSettings } from '@/core/types';
import { clampZoom2D, type ViewportSize, type ViewTransformState } from '@/editor2d/viewTransform';

export class Ortho2D {
  readonly camera: THREE.OrthographicCamera;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.position.set(0, 0, 500);
    this.camera.lookAt(0, 0, 0);
  }

  update(viewport: ViewportSize, canvas: CanvasSettings, transform: ViewTransformState): void {
    const w = Math.max(1, viewport.width);
    const h = Math.max(1, viewport.height);
    const zoom = clampZoom2D(transform.zoom);

    const cmPerImgPxX = canvas.widthCm / Math.max(1, canvas.widthPx);
    const cmPerImgPxY = canvas.heightCm / Math.max(1, canvas.heightPx);

    const left = ((0 - w / 2 - transform.panX) / zoom) * cmPerImgPxX;
    const right = ((w - w / 2 - transform.panX) / zoom) * cmPerImgPxX;
    const top = -((0 - h / 2 - transform.panY) / zoom) * cmPerImgPxY;
    const bottom = -((h - h / 2 - transform.panY) / zoom) * cmPerImgPxY;

    this.camera.left = left;
    this.camera.right = right;
    this.camera.top = top;
    this.camera.bottom = bottom;
    this.camera.updateProjectionMatrix();
  }
}
