import * as THREE from 'three';
import type { CanvasSettings, FrontLightSettings, ShadowMapSize } from '@/core/types';
import { colorSpecToHex } from '@/core/units/colorTemperature';
import {
  computeFrontShadowParams,
  computeFrontSpotIntensity,
  frontLightToWorld,
} from '@/core/units/lighting';
import { disposeLightShadow, disposeObject3D } from '@/engine3d/dispose';

export interface FrontLightStateSnapshot {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  intensity: number;
  castShadow: boolean;
  shadowMapSize: ShadowMapSize;
  gizmoVisible: boolean;
}

export class FrontLight {
  readonly spotLight: THREE.SpotLight;
  readonly gizmoGroup: THREE.Group;

  private readonly bulbMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly coneMesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private readonly aimLine: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly aimLinePositions: Float32Array;
  private readonly dirVec = new THREE.Vector3();
  private readonly downAxis = new THREE.Vector3(0, -1, 0);

  private currentMapSize: ShadowMapSize;
  private disposed = false;

  constructor(
    front: FrontLightSettings,
    canvas: CanvasSettings,
    maxTextureSize: number,
    frontScale = 1,
    showGizmo = true,
  ) {
    this.spotLight = new THREE.SpotLight(
      colorSpecToHex(front.color),
      1,
      0,
      Math.PI / 6,
      front.penumbra,
      2,
    );
    this.spotLight.name = 'FrontSpotLight';
    this.spotLight.target.name = 'FrontSpotLightTarget';

    // Gizmo: small lamp bulb + directional cone + aim line to target (never casts shadows)
    this.gizmoGroup = new THREE.Group();
    this.gizmoGroup.name = 'FrontLightGizmo';

    const bulbGeo = new THREE.SphereGeometry(1.6, 16, 12);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    this.bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
    this.bulbMesh.castShadow = false;
    this.bulbMesh.receiveShadow = false;

    // ConeGeometry points +Y at tip; rotate/align so base opens toward target (-Y in local space)
    const coneGeo = new THREE.ConeGeometry(1.5, 4.2, 16, 1, true);
    coneGeo.translate(0, -2.1, 0);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
    });
    this.coneMesh = new THREE.Mesh(coneGeo, coneMat);
    this.coneMesh.castShadow = false;
    this.coneMesh.receiveShadow = false;

    this.aimLinePositions = new Float32Array(6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.aimLinePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.55,
    });
    this.aimLine = new THREE.Line(lineGeo, lineMat);
    this.aimLine.castShadow = false;
    this.aimLine.receiveShadow = false;

    this.gizmoGroup.add(this.bulbMesh, this.coneMesh, this.aimLine);

    const world = frontLightToWorld(front, canvas);
    const shadowParams = computeFrontShadowParams(
      front,
      canvas,
      world.distanceToTargetCm,
      maxTextureSize,
    );
    this.currentMapSize = shadowParams.mapSize;
    this.spotLight.shadow.mapSize.set(shadowParams.mapSize, shadowParams.mapSize);

    this.update(front, canvas, maxTextureSize, frontScale, showGizmo);
  }

  update(
    front: FrontLightSettings,
    canvas: CanvasSettings,
    maxTextureSize: number,
    frontScale: number,
    showGizmo: boolean,
  ): { shadowConfigChanged: boolean } {
    if (this.disposed) return { shadowConfigChanged: false };

    let shadowConfigChanged = false;

    const world = frontLightToWorld(front, canvas);
    const shadowParams = computeFrontShadowParams(
      front,
      canvas,
      world.distanceToTargetCm,
      maxTextureSize,
    );

    const hexColor = colorSpecToHex(front.color);
    this.spotLight.color.set(hexColor);
    this.bulbMesh.material.color.set(hexColor);

    this.spotLight.position.set(world.position.x, world.position.y, world.position.z);
    this.spotLight.target.position.set(world.target.x, world.target.y, world.target.z);
    this.spotLight.target.updateMatrixWorld();

    this.spotLight.intensity =
      computeFrontSpotIntensity(front.intensity, world.distanceToTargetCm) *
      Math.max(0, frontScale);
    this.spotLight.angle = THREE.MathUtils.degToRad(shadowParams.fov) / 2;
    this.spotLight.penumbra = front.penumbra;
    this.spotLight.decay = 2;

    const nextCastShadow = front.castShadows && frontScale > 0;
    if (this.spotLight.castShadow !== nextCastShadow) {
      this.spotLight.castShadow = nextCastShadow;
      shadowConfigChanged = true;
    }

    if (this.currentMapSize !== shadowParams.mapSize) {
      disposeLightShadow(this.spotLight.shadow);
      this.currentMapSize = shadowParams.mapSize;
      this.spotLight.shadow.mapSize.set(shadowParams.mapSize, shadowParams.mapSize);
      shadowConfigChanged = true;
    }

    this.spotLight.shadow.radius = shadowParams.radius;
    this.spotLight.shadow.bias = shadowParams.bias;
    this.spotLight.shadow.normalBias = shadowParams.normalBias;
    this.spotLight.shadow.camera.near = shadowParams.near;
    this.spotLight.shadow.camera.far = shadowParams.far;
    this.spotLight.shadow.camera.fov = shadowParams.fov;
    this.spotLight.shadow.camera.updateProjectionMatrix();

    // Update gizmo transform cleanly in-place
    this.gizmoGroup.visible = showGizmo && frontScale > 0;
    this.bulbMesh.position.copy(this.spotLight.position);
    this.coneMesh.position.copy(this.spotLight.position);

    this.dirVec.subVectors(this.spotLight.target.position, this.spotLight.position);
    if (this.dirVec.lengthSq() > 1e-8) {
      this.dirVec.normalize();
      this.coneMesh.quaternion.setFromUnitVectors(this.downAxis, this.dirVec);
    }

    this.aimLinePositions[0] = world.position.x;
    this.aimLinePositions[1] = world.position.y;
    this.aimLinePositions[2] = world.position.z;
    this.aimLinePositions[3] = world.target.x;
    this.aimLinePositions[4] = world.target.y;
    this.aimLinePositions[5] = world.target.z;
    const posAttr = this.aimLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    this.aimLine.geometry.computeBoundingSphere();

    return { shadowConfigChanged };
  }

  getSnapshot(): FrontLightStateSnapshot {
    return {
      position: {
        x: this.spotLight.position.x,
        y: this.spotLight.position.y,
        z: this.spotLight.position.z,
      },
      target: {
        x: this.spotLight.target.position.x,
        y: this.spotLight.target.position.y,
        z: this.spotLight.target.position.z,
      },
      intensity: this.spotLight.intensity,
      castShadow: this.spotLight.castShadow,
      shadowMapSize: this.currentMapSize,
      gizmoVisible: this.gizmoGroup.visible,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeLightShadow(this.spotLight.shadow);
    this.spotLight.dispose();
    disposeObject3D(this.gizmoGroup);
  }
}
