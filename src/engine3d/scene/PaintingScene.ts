import * as THREE from 'three';
import type {
  CanvasSettings,
  GridSettings,
  LightingMode,
  LightingSettings,
  MaterialSettings,
  View3DSettings,
} from '@/core/types';
import { computeLightingMix } from '@/core/units/lighting';
import { BackLight, type BackLightStateSnapshot } from '@/engine3d/lights/BackLight';
import { FrontLight, type FrontLightStateSnapshot } from '@/engine3d/lights/FrontLight';
import { CanvasMesh, type CanvasMeshStats } from '@/engine3d/scene/CanvasMesh';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export interface PaintingSceneStats {
  canvas: CanvasMeshStats;
  frontLight: FrontLightStateSnapshot;
  backLight: BackLightStateSnapshot;
}

export class PaintingScene {
  readonly scene: THREE.Scene;
  readonly canvasMesh: CanvasMesh;
  readonly frontLight: FrontLight;
  readonly backLight: BackLight;

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
    effectiveMode: LightingMode = lighting.mode,
    grid?: GridSettings,
  ) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121214);

    const mix = computeLightingMix(effectiveMode, lighting);
    this.ambientLight = new THREE.AmbientLight(0xffffff, mix.ambient);
    this.frontLight = new FrontLight(
      lighting.front,
      canvas,
      maxTextureSize,
      mix.frontScale,
      showGizmo,
    );
    this.backLight = new BackLight(lighting.back, canvas, mix.backScale, showGizmo);
    const backParams = this.backLight.getShaderParams();

    this.canvasMesh = new CanvasMesh(textures, canvas, materialSettings, view3d, backParams, grid);

    this.scene.add(
      this.canvasMesh.group,
      this.ambientLight,
      this.frontLight.spotLight,
      this.frontLight.spotLight.target,
      this.frontLight.gizmoGroup,
      this.backLight.gizmoGroup,
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
    effectiveMode: LightingMode = lighting.mode,
    grid?: GridSettings,
  ): { shadowConfigChanged: boolean; frontScale: number } {
    if (this.disposed) return { shadowConfigChanged: false, frontScale: 0 };

    const mix = computeLightingMix(effectiveMode, lighting);
    this.ambientLight.intensity = mix.ambient;

    const backParams = this.backLight.update(lighting.back, canvas, mix.backScale, showGizmo);
    this.canvasMesh.update(textures, canvas, materialSettings, view3d, backParams, grid);

    const { shadowConfigChanged } = this.frontLight.update(
      lighting.front,
      canvas,
      maxTextureSize,
      mix.frontScale,
      showGizmo,
    );
    return { shadowConfigChanged, frontScale: mix.frontScale };
  }

  getCanvasStats(): CanvasMeshStats {
    return this.canvasMesh.getStats();
  }

  getFrontLightStats(): FrontLightStateSnapshot {
    return this.frontLight.getSnapshot();
  }

  getBackLightStats(): BackLightStateSnapshot {
    return this.backLight.getSnapshot();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.frontLight.dispose();
    this.backLight.dispose();
    this.canvasMesh.dispose();
  }
}
