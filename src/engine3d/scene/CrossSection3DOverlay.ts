import * as THREE from 'three';
import { bilinearSampleFloat } from '@/core/geometry/crossSection';
import { clamp01 } from '@/core/maps/quantize';
import type { CanvasSettings, LineSegment } from '@/core/types';
import { pxToWorldXY, valueToWorldZCm } from '@/core/units/calibration';

export const CROSS_SECTION_3D_Z_OFFSET_CM = 0.02;

export interface CrossSection3DOverlayStats {
  visible: boolean;
  vertexCount: number;
  hoverVisible: boolean;
  minZCm: number | null;
  maxZCm: number | null;
}

export interface CrossSection3DOverlayUpdate {
  visible: boolean;
  line: LineSegment | null;
  hoverT: number | null;
  heightEffective: Float32Array | null;
  heightVersion: number;
  canvas: CanvasSettings;
  reliefMultiplier: number;
}

export class CrossSection3DOverlay {
  readonly group: THREE.Group;

  private readonly lineObject: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly lineMaterial: THREE.LineBasicMaterial;
  private readonly hoverMarker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly hoverMaterial: THREE.MeshBasicMaterial;
  private lastGeometryKey = '';
  private vertexCount = 0;
  private minZCm: number | null = null;
  private maxZCm: number | null = null;
  private disposed = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CrossSection3DOverlay';
    this.group.visible = false;

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.96,
      depthTest: true,
    });
    const initialGeo = new THREE.BufferGeometry();
    this.lineObject = new THREE.Line(initialGeo, this.lineMaterial);
    this.lineObject.name = 'CrossSection3DLine';
    this.lineObject.frustumCulled = false;

    const markerGeo = new THREE.SphereGeometry(1, 16, 12);
    this.hoverMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });
    this.hoverMarker = new THREE.Mesh(markerGeo, this.hoverMaterial);
    this.hoverMarker.name = 'CrossSection3DHoverMarker';
    this.hoverMarker.visible = false;
    this.hoverMarker.castShadow = false;
    this.hoverMarker.receiveShadow = false;

    this.group.add(this.lineObject, this.hoverMarker);
  }

  update(params: CrossSection3DOverlayUpdate): void {
    if (this.disposed) return;

    const { visible, line, hoverT, heightEffective, heightVersion, canvas, reliefMultiplier } =
      params;

    if (!visible || !line || !heightEffective || heightEffective.length === 0) {
      this.group.visible = false;
      this.hoverMarker.visible = false;
      return;
    }

    this.group.visible = true;

    const key = `${line.p0.x.toFixed(3)},${line.p0.y.toFixed(3)}-${line.p1.x.toFixed(3)},${line.p1.y.toFixed(3)}|${canvas.widthCm}|${canvas.heightCm}|${canvas.widthPx}x${canvas.heightPx}|${canvas.minThicknessMm}:${canvas.maxThicknessMm}|${reliefMultiplier}|${heightVersion}`;

    if (key !== this.lastGeometryKey) {
      this.lastGeometryKey = key;
      const lengthPx = Math.hypot(line.p1.x - line.p0.x, line.p1.y - line.p0.y);
      const count = Math.max(2, Math.min(1024, Math.ceil(lengthPx)));
      const positions = new Float32Array(count * 3);

      let minZ = Number.POSITIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;

      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const xPx = line.p0.x + (line.p1.x - line.p0.x) * t;
        const yPx = line.p0.y + (line.p1.y - line.p0.y) * t;
        const h = clamp01(
          bilinearSampleFloat(heightEffective, canvas.widthPx, canvas.heightPx, xPx, yPx),
        );
        const worldXY = pxToWorldXY(xPx, yPx, canvas);
        const worldZ =
          valueToWorldZCm(h, canvas.minThicknessMm, canvas.maxThicknessMm, reliefMultiplier) +
          CROSS_SECTION_3D_Z_OFFSET_CM;

        positions[i * 3] = worldXY.x;
        positions[i * 3 + 1] = worldXY.y;
        positions[i * 3 + 2] = worldZ;

        if (worldZ < minZ) minZ = worldZ;
        if (worldZ > maxZ) maxZ = worldZ;
      }

      const nextGeo = new THREE.BufferGeometry();
      nextGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      nextGeo.computeBoundingSphere();
      const prevGeo = this.lineObject.geometry;
      this.lineObject.geometry = nextGeo;
      prevGeo.dispose();

      this.vertexCount = count;
      this.minZCm = Number.isFinite(minZ) ? minZ : null;
      this.maxZCm = Number.isFinite(maxZ) ? maxZ : null;
    }

    if (hoverT !== null && Number.isFinite(hoverT)) {
      const t = clamp01(hoverT);
      const xPx = line.p0.x + (line.p1.x - line.p0.x) * t;
      const yPx = line.p0.y + (line.p1.y - line.p0.y) * t;
      const h = clamp01(
        bilinearSampleFloat(heightEffective, canvas.widthPx, canvas.heightPx, xPx, yPx),
      );
      const worldXY = pxToWorldXY(xPx, yPx, canvas);
      const worldZ =
        valueToWorldZCm(h, canvas.minThicknessMm, canvas.maxThicknessMm, reliefMultiplier) +
        CROSS_SECTION_3D_Z_OFFSET_CM;
      const markerRadius = Math.max(
        0.12,
        Math.min(0.45, Math.min(canvas.widthCm, canvas.heightCm) * 0.008),
      );
      this.hoverMarker.scale.setScalar(markerRadius);
      this.hoverMarker.position.set(worldXY.x, worldXY.y, worldZ);
      this.hoverMarker.visible = true;
    } else {
      this.hoverMarker.visible = false;
    }
  }

  getStats(): CrossSection3DOverlayStats {
    return {
      visible: this.group.visible,
      vertexCount: this.group.visible ? this.vertexCount : 0,
      hoverVisible: this.group.visible && this.hoverMarker.visible,
      minZCm: this.group.visible ? this.minZCm : null,
      maxZCm: this.group.visible ? this.maxZCm : null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lineObject.geometry.dispose();
    this.lineMaterial.dispose();
    this.hoverMarker.geometry.dispose();
    this.hoverMaterial.dispose();
  }
}
