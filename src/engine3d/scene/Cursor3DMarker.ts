import * as THREE from 'three';
import { bilinearSampleFloat } from '@/core/geometry/crossSection';
import { clamp01 } from '@/core/maps/quantize';
import type { CanvasSettings, Vec2 } from '@/core/types';
import { pxToWorldXY, valueToWorldZCm } from '@/core/units/calibration';

export const CURSOR_3D_Z_OFFSET_CM = 0.05;

export interface Cursor3DMarkerStats {
  visible: boolean;
  worldPos: { x: number; y: number; z: number } | null;
}

export interface Cursor3DMarkerUpdate {
  visible: boolean;
  imagePos: Vec2 | null;
  heightEffective: Float32Array | null;
  canvas: CanvasSettings;
  reliefMultiplier: number;
}

export class Cursor3DMarker {
  readonly group: THREE.Group;

  private readonly innerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly outerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly centerDot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly innerMat: THREE.MeshBasicMaterial;
  private readonly outerMat: THREE.MeshBasicMaterial;
  private readonly dotMat: THREE.MeshBasicMaterial;
  private worldPos: { x: number; y: number; z: number } | null = null;
  private disposed = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Cursor3DMarker';
    this.group.visible = false;

    const innerGeo = new THREE.RingGeometry(0.6, 1.0, 24);
    this.innerMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    this.innerRing = new THREE.Mesh(innerGeo, this.innerMat);
    this.innerRing.castShadow = false;
    this.innerRing.receiveShadow = false;
    this.innerRing.renderOrder = 10;

    const outerGeo = new THREE.RingGeometry(1.0, 1.28, 24);
    this.outerMat = new THREE.MeshBasicMaterial({
      color: 0x0b0b0d,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.outerRing = new THREE.Mesh(outerGeo, this.outerMat);
    this.outerRing.castShadow = false;
    this.outerRing.receiveShadow = false;
    this.outerRing.renderOrder = 10;

    const dotGeo = new THREE.SphereGeometry(0.28, 12, 8);
    this.dotMat = new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
    });
    this.centerDot = new THREE.Mesh(dotGeo, this.dotMat);
    this.centerDot.castShadow = false;
    this.centerDot.receiveShadow = false;
    this.centerDot.renderOrder = 11;

    this.group.add(this.outerRing, this.innerRing, this.centerDot);
  }

  update(params: Cursor3DMarkerUpdate): void {
    if (this.disposed) return;

    const { visible, imagePos, heightEffective, canvas, reliefMultiplier } = params;
    if (
      !visible ||
      !imagePos ||
      !Number.isFinite(imagePos.x) ||
      !Number.isFinite(imagePos.y) ||
      imagePos.x < 0 ||
      imagePos.x > canvas.widthPx ||
      imagePos.y < 0 ||
      imagePos.y > canvas.heightPx
    ) {
      this.group.visible = false;
      this.worldPos = null;
      return;
    }

    const clampedX = Math.min(canvas.widthPx, Math.max(0, imagePos.x));
    const clampedY = Math.min(canvas.heightPx, Math.max(0, imagePos.y));
    const h =
      heightEffective && heightEffective.length > 0
        ? clamp01(
            bilinearSampleFloat(heightEffective, canvas.widthPx, canvas.heightPx, clampedX, clampedY),
          )
        : 0;

    const worldXY = pxToWorldXY(clampedX, clampedY, canvas);
    const worldZ =
      valueToWorldZCm(h, canvas.minThicknessMm, canvas.maxThicknessMm, reliefMultiplier) +
      CURSOR_3D_Z_OFFSET_CM;

    const markerScale = Math.max(
      0.24,
      Math.min(0.85, Math.min(canvas.widthCm, canvas.heightCm) * 0.014),
    );
    this.group.scale.setScalar(markerScale);
    this.group.position.set(worldXY.x, worldXY.y, worldZ);
    this.group.visible = true;
    this.worldPos = { x: worldXY.x, y: worldXY.y, z: worldZ };
  }

  getStats(): Cursor3DMarkerStats {
    return {
      visible: this.group.visible,
      worldPos: this.group.visible && this.worldPos ? { ...this.worldPos } : null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.innerRing.geometry.dispose();
    this.innerMat.dispose();
    this.outerRing.geometry.dispose();
    this.outerMat.dispose();
    this.centerDot.geometry.dispose();
    this.dotMat.dispose();
  }
}
