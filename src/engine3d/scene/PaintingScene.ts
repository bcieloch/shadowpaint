import * as THREE from 'three';
import type {
  CanvasSettings,
  LightingSettings,
  MaterialSettings,
  View3DSettings,
} from '@/core/types';
import { FrontLight, type FrontLightStateSnapshot } from '@/engine3d/lights/FrontLight';
import { CanvasMesh, type CanvasMeshStats } from '@/engine3d/scene/CanvasMesh';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export interface PaintingSceneStats {
  canvas: CanvasMeshStats;
  frontLight: FrontLightStateSnapshot;
}

export class PaintingScene {
  readonly scene: THREE.Scene;
  readonly canvasMesh: CanvasMesh;
  readonly frontLight: FrontLight;

  private readonly ambientLight: THREE.AmbientLight;
  private disposed = false;

  constructor(
    textures: MapTextures,
    canvas: CanvasSettings,
    materialSettings: MaterialSettings,
    lighting: LightingSettings,
    view3d: View3DSettings,
    maxTextureSize: number,
    showGizmo: boolean,
  ) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121214);

    this.canvasMesh = new CanvasMesh(textures, canvas, materialSettings, view3d);
    this.scene.add(this.canvasMesh.group);

    this.ambientLight = new THREE.AmbientLight(0xffffff, lighting.ambientFront);
    this.frontLight = new FrontLight(lighting.front, canvas, maxTextureSize, 1, showGizmo);

    this.scene.add(
      this.ambientLight,
      this.frontLight.spotLight,
      this.frontLight.spotLight.target,
      this.frontLight.gizmoGroup,
    );
  }

  update(
    textures: MapTextures,
    canvas: CanvasSettings,
    materialSettings: MaterialSettings,
    lighting: LightingSettings,
    view3d: View3DSettings,
    maxTextureSize: number,
    showGizmo: boolean,
  ): { shadowConfigChanged: boolean } {
    if (this.disposed) return { shadowConfigChanged: false };
    this.canvasMesh.update(textures, canvas, materialSettings, view3d);
    this.ambientLight.intensity = lighting.ambientFront;
    return this.frontLight.update(lighting.front, canvas, maxTextureSize, 1, showGizmo);
  }

  getCanvasStats(): CanvasMeshStats {
    return this.canvasMesh.getStats();
  }

  getFrontLightStats(): FrontLightStateSnapshot {
    return this.frontLight.getSnapshot();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.frontLight.dispose();
    this.canvasMesh.dispose();
  }
}
