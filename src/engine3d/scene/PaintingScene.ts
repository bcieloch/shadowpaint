import * as THREE from 'three';
import type { CanvasSettings, MaterialSettings, View3DSettings } from '@/core/types';
import { disposeLightShadow } from '@/engine3d/dispose';
import { CanvasMesh, type CanvasMeshStats } from '@/engine3d/scene/CanvasMesh';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export class PaintingScene {
  readonly scene: THREE.Scene;
  readonly canvasMesh: CanvasMesh;

  private readonly ambientLight: THREE.AmbientLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly backFillLight: THREE.DirectionalLight;
  private disposed = false;

  constructor(
    textures: MapTextures,
    canvas: CanvasSettings,
    materialSettings: MaterialSettings,
    view3d: View3DSettings,
  ) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121214);

    this.canvasMesh = new CanvasMesh(textures, canvas, materialSettings, view3d);
    this.scene.add(this.canvasMesh.group);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.22);

    this.keyLight = new THREE.DirectionalLight(0xfff1e0, 2.2);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0002;
    this.keyLight.shadow.normalBias = 0.02;

    this.backFillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    this.backFillLight.position.set(0, 0, -100);
    this.backFillLight.castShadow = false;

    this.scene.add(this.ambientLight, this.keyLight, this.keyLight.target, this.backFillLight);
    this.updatePreviewLightFrustum(canvas);
  }

  update(
    textures: MapTextures,
    canvas: CanvasSettings,
    materialSettings: MaterialSettings,
    view3d: View3DSettings,
  ): void {
    if (this.disposed) return;
    this.canvasMesh.update(textures, canvas, materialSettings, view3d);
    this.updatePreviewLightFrustum(canvas);
  }

  getCanvasStats(): CanvasMeshStats {
    return this.canvasMesh.getStats();
  }

  private updatePreviewLightFrustum(canvas: CanvasSettings): void {
    const maxDim = Math.max(canvas.widthCm, canvas.heightCm);
    const halfSpan = Math.max(10, Math.hypot(canvas.widthCm, canvas.heightCm) * 0.65);

    this.keyLight.position.set(canvas.widthCm * 0.45, canvas.heightCm * 0.55, maxDim * 0.9);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.target.updateMatrixWorld();

    const cam = this.keyLight.shadow.camera;
    cam.left = -halfSpan;
    cam.right = halfSpan;
    cam.top = halfSpan;
    cam.bottom = -halfSpan;
    cam.near = 0.5;
    cam.far = maxDim * 4;
    cam.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeLightShadow(this.keyLight.shadow);
    this.canvasMesh.dispose();
  }
}
