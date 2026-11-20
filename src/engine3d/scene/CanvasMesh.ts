import * as THREE from 'three';
import type {
  CanvasSettings,
  GridSettings,
  MaterialSettings,
  MeshDetail,
  View3DSettings,
} from '@/core/types';
import {
  computeDisplacementParams,
  computeMeshSegments,
  type DisplacementParams,
} from '@/core/units/calibration';
import type { BackLightShaderParams } from '@/engine3d/lights/BackLight';
import {
  createPaintDepthMaterial,
  updatePaintDepthMaterial,
} from '@/engine3d/materials/paintDepthMaterial';
import { createPaintMaterial, updatePaintMaterial } from '@/engine3d/materials/paintMaterial';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export interface CanvasMeshGeometryResult {
  geometry: THREE.PlaneGeometry;
  segX: number;
  segY: number;
  vertices: number;
}

export function createCanvasMeshGeometry(
  widthCm: number,
  heightCm: number,
  meshDetail: MeshDetail,
): CanvasMeshGeometryResult {
  const { segX, segY, vertices } = computeMeshSegments(widthCm, heightCm, meshDetail);
  const geometry = new THREE.PlaneGeometry(widthCm, heightCm, segX, segY);
  const uv = geometry.attributes.uv;
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      uv.setY(i, 1 - uv.getY(i));
    }
    uv.needsUpdate = true;
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, segX, segY, vertices };
}

function buildStretcherFrameGroup(
  widthCm: number,
  heightCm: number,
  material: THREE.MeshStandardMaterial,
): THREE.Group {
  const frameGroup = new THREE.Group();
  frameGroup.name = 'StretcherFrame';

  const profileCm = Math.min(2, widthCm * 0.25, heightCm * 0.25);
  const depthCm = 2;
  const centerZ = -(0.02 + depthCm / 2);

  // Top & bottom bars span full width
  const topGeo = new THREE.BoxGeometry(widthCm, profileCm, depthCm);
  const topBar = new THREE.Mesh(topGeo, material);
  topBar.position.set(0, heightCm / 2 - profileCm / 2, centerZ);
  topBar.castShadow = true;
  topBar.receiveShadow = true;

  const bottomGeo = new THREE.BoxGeometry(widthCm, profileCm, depthCm);
  const bottomBar = new THREE.Mesh(bottomGeo, material);
  bottomBar.position.set(0, -heightCm / 2 + profileCm / 2, centerZ);
  bottomBar.castShadow = true;
  bottomBar.receiveShadow = true;

  frameGroup.add(topBar, bottomBar);

  const sideHeight = heightCm - profileCm * 2;
  if (sideHeight > 0.01) {
    const leftGeo = new THREE.BoxGeometry(profileCm, sideHeight, depthCm);
    const leftBar = new THREE.Mesh(leftGeo, material);
    leftBar.position.set(-widthCm / 2 + profileCm / 2, 0, centerZ);
    leftBar.castShadow = true;
    leftBar.receiveShadow = true;

    const rightGeo = new THREE.BoxGeometry(profileCm, sideHeight, depthCm);
    const rightBar = new THREE.Mesh(rightGeo, material);
    rightBar.position.set(widthCm / 2 - profileCm / 2, 0, centerZ);
    rightBar.castShadow = true;
    rightBar.receiveShadow = true;

    frameGroup.add(leftBar, rightBar);
  }

  return frameGroup;
}

export interface CanvasMeshStats {
  boundingBoxSizeCm: { x: number; y: number; z: number };
  displacement: DisplacementParams;
  segX: number;
  segY: number;
  vertices: number;
  frameVisible: boolean;
  gridVisible: boolean;
}

export class CanvasMesh {
  readonly group: THREE.Group;
  readonly frontMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  readonly backMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  readonly paintMaterial: THREE.MeshStandardMaterial;
  readonly paintDepthMaterial: THREE.MeshDepthMaterial;
  readonly backMaterial: THREE.MeshStandardMaterial;
  readonly frameMaterial: THREE.MeshStandardMaterial;

  private frameGroup: THREE.Group;
  private builtWidthCm: number;
  private builtHeightCm: number;
  private builtMeshDetail: MeshDetail;
  private segX: number;
  private segY: number;
  private vertices: number;
  private lastDisplacement: DisplacementParams;
  private gridVisible = false;
  private disposed = false;

  constructor(
    textures: MapTextures,
    canvas: CanvasSettings,
    materialSettings: MaterialSettings,
    view3d: View3DSettings,
    backParams?: BackLightShaderParams,
    grid?: GridSettings,
  ) {
    this.group = new THREE.Group();
    this.group.name = 'CanvasRoot';

    this.builtWidthCm = canvas.widthCm;
    this.builtHeightCm = canvas.heightCm;
    this.builtMeshDetail = view3d.meshDetail;
    this.gridVisible = Boolean(grid?.show3D);

    const frontGeoRes = createCanvasMeshGeometry(
      canvas.widthCm,
      canvas.heightCm,
      view3d.meshDetail,
    );
    this.segX = frontGeoRes.segX;
    this.segY = frontGeoRes.segY;
    this.vertices = frontGeoRes.vertices;

    this.lastDisplacement = computeDisplacementParams(
      canvas.minThicknessMm,
      canvas.maxThicknessMm,
      view3d.reliefMultiplier,
    );

    this.paintMaterial = createPaintMaterial(
      textures,
      canvas,
      materialSettings,
      view3d,
      backParams,
      grid,
    );
    this.paintDepthMaterial = createPaintDepthMaterial(
      textures.heightTex,
      this.lastDisplacement.displacementScale,
      this.lastDisplacement.displacementBias,
    );

    this.frontMesh = new THREE.Mesh(frontGeoRes.geometry, this.paintMaterial);
    this.frontMesh.name = 'PaintFrontMesh';
    this.frontMesh.castShadow = true;
    this.frontMesh.receiveShadow = true;
    this.frontMesh.customDepthMaterial = this.paintDepthMaterial;

    const backGeo = new THREE.PlaneGeometry(canvas.widthCm, canvas.heightCm, 1, 1);
    backGeo.computeBoundingBox();
    this.backMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(materialSettings.canvasBackColor),
      roughness: 0.9,
      metalness: 0,
      side: THREE.BackSide,
    });
    this.updateBackFaceLighting(materialSettings, backParams);

    this.backMesh = new THREE.Mesh(backGeo, this.backMaterial);
    this.backMesh.name = 'CanvasBackMesh';
    this.backMesh.position.set(0, 0, -0.02);
    this.backMesh.castShadow = false;
    this.backMesh.receiveShadow = false;

    this.frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x7c5c3e,
      roughness: 0.78,
      metalness: 0,
    });
    this.frameGroup = buildStretcherFrameGroup(canvas.widthCm, canvas.heightCm, this.frameMaterial);
    this.frameGroup.visible = view3d.showFrame;

    this.group.add(this.frontMesh, this.backMesh, this.frameGroup);
  }

  update(
    textures: MapTextures,
    canvas: CanvasSettings,
    materialSettings: MaterialSettings,
    view3d: View3DSettings,
    backParams?: BackLightShaderParams,
    grid?: GridSettings,
  ): void {
    if (this.disposed) return;

    const geometryChanged =
      this.builtWidthCm !== canvas.widthCm ||
      this.builtHeightCm !== canvas.heightCm ||
      this.builtMeshDetail !== view3d.meshDetail;

    if (geometryChanged) {
      this.rebuildGeometries(canvas.widthCm, canvas.heightCm, view3d.meshDetail);
    }

    this.lastDisplacement = computeDisplacementParams(
      canvas.minThicknessMm,
      canvas.maxThicknessMm,
      view3d.reliefMultiplier,
    );
    this.gridVisible = Boolean(grid?.show3D);

    updatePaintMaterial(
      this.paintMaterial,
      canvas,
      materialSettings,
      view3d,
      textures.width,
      textures.height,
      backParams,
      grid,
    );
    updatePaintDepthMaterial(
      this.paintDepthMaterial,
      this.lastDisplacement.displacementScale,
      this.lastDisplacement.displacementBias,
    );

    this.updateBackFaceLighting(materialSettings, backParams);
    this.frameGroup.visible = view3d.showFrame;
  }

  private updateBackFaceLighting(
    materialSettings: MaterialSettings,
    backParams?: BackLightShaderParams,
  ): void {
    this.backMaterial.color.set(materialSettings.canvasBackColor);
    if (backParams && backParams.backScale > 0 && backParams.intensity > 0) {
      this.backMaterial.emissive.copy(backParams.colorLinear);
      this.backMaterial.emissiveIntensity =
        0.18 * backParams.backScale * Math.min(2, backParams.intensity);
    } else {
      this.backMaterial.emissive.setRGB(0, 0, 0);
      this.backMaterial.emissiveIntensity = 0;
    }
  }

  getStats(): CanvasMeshStats {
    this.frontMesh.geometry.computeBoundingBox();
    const box = this.frontMesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    if (box) {
      box.getSize(size);
    }
    return {
      boundingBoxSizeCm: { x: size.x, y: size.y, z: size.z },
      displacement: { ...this.lastDisplacement },
      segX: this.segX,
      segY: this.segY,
      vertices: this.vertices,
      frameVisible: this.frameGroup.visible,
      gridVisible: this.gridVisible,
    };
  }

  private rebuildGeometries(widthCm: number, heightCm: number, meshDetail: MeshDetail): void {
    const prevFrontGeo = this.frontMesh.geometry;
    const nextFront = createCanvasMeshGeometry(widthCm, heightCm, meshDetail);
    this.frontMesh.geometry = nextFront.geometry;
    prevFrontGeo.dispose();

    const dimensionsChanged = this.builtWidthCm !== widthCm || this.builtHeightCm !== heightCm;
    if (dimensionsChanged) {
      const prevBackGeo = this.backMesh.geometry;
      const nextBackGeo = new THREE.PlaneGeometry(widthCm, heightCm, 1, 1);
      nextBackGeo.computeBoundingBox();
      this.backMesh.geometry = nextBackGeo;
      prevBackGeo.dispose();

      const wasVisible = this.frameGroup.visible;
      this.group.remove(this.frameGroup);
      this.disposeFrameGeometries();
      this.frameGroup = buildStretcherFrameGroup(widthCm, heightCm, this.frameMaterial);
      this.frameGroup.visible = wasVisible;
      this.group.add(this.frameGroup);
    }

    this.builtWidthCm = widthCm;
    this.builtHeightCm = heightCm;
    this.builtMeshDetail = meshDetail;
    this.segX = nextFront.segX;
    this.segY = nextFront.segY;
    this.vertices = nextFront.vertices;
  }

  private disposeFrameGeometries(): void {
    this.frameGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.BufferGeometry) {
        obj.geometry.dispose();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.frontMesh.geometry.dispose();
    this.backMesh.geometry.dispose();
    this.disposeFrameGeometries();
    this.paintMaterial.dispose();
    this.paintDepthMaterial.dispose();
    this.backMaterial.dispose();
    this.frameMaterial.dispose();
  }
}
