import * as THREE from 'three';
import type { BackLightSettings, BackLightType, CanvasSettings } from '@/core/types';
import { colorSpecToHex } from '@/core/units/colorTemperature';
import { backLightToWorld } from '@/core/units/lighting';
import { disposeObject3D } from '@/engine3d/dispose';

export interface BackLightShaderParams {
  position: THREE.Vector3;
  colorLinear: THREE.Color;
  intensity: number;
  type: BackLightType;
  globalTransmission: number;
  attenuation: number;
  backScale: number;
}

export interface BackLightStateSnapshot {
  type: BackLightType;
  position: { x: number; y: number; z: number };
  intensity: number;
  globalTransmissionPct: number;
  attenuation: number;
  backScale: number;
  gizmoVisible: boolean;
}

export class BackLight {
  readonly gizmoGroup: THREE.Group;

  private readonly pointBulb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly panelFrame: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  private readonly aimLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly aimLinePositions: Float32Array;

  private readonly worldPos = new THREE.Vector3();
  private readonly colorLinear = new THREE.Color(0xffffff);
  private lastType: BackLightType = 'point';
  private lastIntensity = 1;
  private lastGlobalTransmissionPct = 100;
  private lastAttenuation = 1;
  private lastBackScale = 0;
  private disposed = false;

  constructor(back: BackLightSettings, canvas: CanvasSettings, backScale = 0, showGizmo = true) {
    this.gizmoGroup = new THREE.Group();
    this.gizmoGroup.name = 'BackLightGizmo';

    const bulbGeo = new THREE.SphereGeometry(1.4, 16, 12);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.pointBulb = new THREE.Mesh(bulbGeo, bulbMat);
    this.pointBulb.castShadow = false;
    this.pointBulb.receiveShadow = false;

    const panelGeo = new THREE.PlaneGeometry(10, 10);
    const panelEdges = new THREE.EdgesGeometry(panelGeo);
    panelGeo.dispose();
    const panelMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
    });
    this.panelFrame = new THREE.LineSegments(panelEdges, panelMat);
    this.panelFrame.castShadow = false;
    this.panelFrame.receiveShadow = false;

    this.aimLinePositions = new Float32Array(6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.aimLinePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
    });
    this.aimLine = new THREE.Line(lineGeo, lineMat);
    this.aimLine.castShadow = false;
    this.aimLine.receiveShadow = false;

    this.gizmoGroup.add(this.pointBulb, this.panelFrame, this.aimLine);

    this.update(back, canvas, backScale, showGizmo);
  }

  update(
    back: BackLightSettings,
    canvas: CanvasSettings,
    backScale: number,
    showGizmo: boolean,
  ): BackLightShaderParams {
    const mapped = backLightToWorld(back, canvas);
    this.worldPos.set(mapped.position.x, mapped.position.y, mapped.position.z);

    const hexColor = colorSpecToHex(back.color);
    this.colorLinear.set(hexColor);
    this.pointBulb.material.color.set(hexColor);
    this.panelFrame.material.color.set(hexColor);

    this.lastType = back.type;
    this.lastIntensity = Math.max(0, back.intensity);
    this.lastGlobalTransmissionPct = Math.max(0, back.globalTransmissionPct);
    this.lastAttenuation = Math.max(0, back.attenuation);
    this.lastBackScale = Math.max(0, backScale);

    if (!this.disposed) {
      this.gizmoGroup.visible = showGizmo && this.lastBackScale > 0;
      this.pointBulb.visible = back.type === 'point';
      this.panelFrame.visible = back.type === 'panel';

      this.pointBulb.position.copy(this.worldPos);
      this.panelFrame.position.set(0, 0, -mapped.zDistanceCm);
      this.panelFrame.scale.set(
        Math.max(0.2, canvas.widthCm / 10),
        Math.max(0.2, canvas.heightCm / 10),
        1,
      );

      this.aimLine.visible = back.type === 'point';
      this.aimLinePositions[0] = this.worldPos.x;
      this.aimLinePositions[1] = this.worldPos.y;
      this.aimLinePositions[2] = this.worldPos.z;
      this.aimLinePositions[3] = this.worldPos.x;
      this.aimLinePositions[4] = this.worldPos.y;
      this.aimLinePositions[5] = 0;
      const posAttr = this.aimLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      this.aimLine.geometry.computeBoundingSphere();
    }

    return this.getShaderParams();
  }

  getShaderParams(): BackLightShaderParams {
    return {
      position: this.worldPos,
      colorLinear: this.colorLinear,
      intensity: this.lastIntensity,
      type: this.lastType,
      globalTransmission: this.lastGlobalTransmissionPct / 100,
      attenuation: this.lastAttenuation,
      backScale: this.lastBackScale,
    };
  }

  getSnapshot(): BackLightStateSnapshot {
    return {
      type: this.lastType,
      position: {
        x: this.worldPos.x,
        y: this.worldPos.y,
        z: this.worldPos.z,
      },
      intensity: this.lastIntensity,
      globalTransmissionPct: this.lastGlobalTransmissionPct,
      attenuation: this.lastAttenuation,
      backScale: this.lastBackScale,
      gizmoVisible: this.gizmoGroup.visible,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObject3D(this.gizmoGroup);
  }
}
