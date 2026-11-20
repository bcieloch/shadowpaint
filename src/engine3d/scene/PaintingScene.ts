import * as THREE from 'three';
import type {
  CanvasSettings,
  GridSettings,
  LightingMode,
  LightingSettings,
  LineSegment,
  MaterialSettings,
  View3DSettings,
} from '@/core/types';
import { computeLightingMix } from '@/core/units/lighting';
import { BackLight, type BackLightStateSnapshot } from '@/engine3d/lights/BackLight';
import { FrontLight, type FrontLightStateSnapshot } from '@/engine3d/lights/FrontLight';
import { CanvasMesh, type CanvasMeshStats } from '@/engine3d/scene/CanvasMesh';
import {
  CrossSection3DOverlay,
  type CrossSection3DOverlayStats,
} from '@/engine3d/scene/CrossSection3DOverlay';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export interface PaintingSceneStats {
  canvas: CanvasMeshStats;
  frontLight: FrontLightStateSnapshot;
  backLight: BackLightStateSnapshot;
}

export interface CrossSectionOverlayInput {
  visible: boolean;
  line: LineSegment | null;
  hoverT: number | null;
  heightEffective: Float32Array | null;
  heightVersion: number;
}

export class PaintingScene {
  readonly scene: THREE.Scene;
  readonly canvasMesh: CanvasMesh;
  readonly frontLight: FrontLight;
  readonly backLight: BackLight;
  readonly crossSectionOverlay: CrossSection3DOverlay;

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
    crossSection?: CrossSectionOverlayInput,
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
    this.crossSectionOverlay = new CrossSection3DOverlay();
    if (crossSection) {
      this.crossSectionOverlay.update({
        ...crossSection,
        canvas,
        reliefMultiplier: view3d.reliefMultiplier,
      });
    }

    this.scene.add(
      this.canvasMesh.group,
      this.crossSectionOverlay.group,
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
    crossSection?: CrossSectionOverlayInput,
  ): { shadowConfigChanged: boolean; frontScale: number } {
    if (this.disposed) return { shadowConfigChanged: false, frontScale: 0 };

    const mix = computeLightingMix(effectiveMode, lighting);
    this.ambientLight.intensity = mix.ambient;

    const backParams = this.backLight.update(lighting.back, canvas, mix.backScale, showGizmo);
    this.canvasMesh.update(textures, canvas, materialSettings, view3d, backParams, grid);

    if (crossSection) {
      this.crossSectionOverlay.update({
        ...crossSection,
        canvas,
        reliefMultiplier: view3d.reliefMultiplier,
      });
    } else {
      this.crossSectionOverlay.update({
        visible: false,
        line: null,
        hoverT: null,
        heightEffective: null,
        heightVersion: 0,
        canvas,
        reliefMultiplier: view3d.reliefMultiplier,
      });
    }

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

  getCrossSectionStats(): CrossSection3DOverlayStats {
    return this.crossSectionOverlay.getStats();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.frontLight.dispose();
    this.backLight.dispose();
    this.crossSectionOverlay.dispose();
    this.canvasMesh.dispose();
  }
}
