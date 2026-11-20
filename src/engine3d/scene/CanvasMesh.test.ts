import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import { MapRegistry } from '@/core/maps/MapRegistry';
import { computeDisplacementParams, computeMeshSegments } from '@/core/units/calibration';
import { CanvasMesh, createCanvasMeshGeometry } from '@/engine3d/scene/CanvasMesh';
import { MapTextures } from '@/engine3d/textures/MapTextures';

function createMockRenderer(): THREE.WebGLRenderer {
  return {
    capabilities: {
      maxTextureSize: 8192,
      getMaxAnisotropy: () => 4,
    },
  } as unknown as THREE.WebGLRenderer;
}

describe('CanvasMesh & 3D geometry', () => {
  it('builds 50x70 cm geometry with exact bounding box, 5:7 proportion, and flipped UVs', () => {
    const { geometry, segX, segY, vertices } = createCanvasMeshGeometry(50, 70, 1024);
    const expected = computeMeshSegments(50, 70, 1024);

    expect(segX).toBe(expected.segX);
    expect(segY).toBe(expected.segY);
    expect(vertices).toBe(expected.vertices);

    const box = geometry.boundingBox;
    expect(box).not.toBeNull();
    if (box) {
      const size = new THREE.Vector3();
      box.getSize(size);
      expect(size.x).toBeCloseTo(50, 6);
      expect(size.y).toBeCloseTo(70, 6);
      expect(size.z).toBeCloseTo(0, 6);
      expect(size.x / size.y).toBeCloseTo(5 / 7, 6);
    }

    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    expect(pos).toBeDefined();
    expect(uv).toBeDefined();
    if (pos && uv) {
      // PlaneGeometry vertex 0 is top-left (-width/2, +height/2) -> flipped UV must be (0, 0)
      expect(pos.getX(0)).toBeCloseTo(-25, 5);
      expect(pos.getY(0)).toBeCloseTo(35, 5);
      expect(uv.getX(0)).toBeCloseTo(0, 6);
      expect(uv.getY(0)).toBeCloseTo(0, 6);

      // Last vertex is bottom-right (+width/2, -height/2) -> flipped UV must be (1, 1)
      const last = pos.count - 1;
      expect(pos.getX(last)).toBeCloseTo(25, 5);
      expect(pos.getY(last)).toBeCloseTo(-35, 5);
      expect(uv.getX(last)).toBeCloseTo(1, 6);
      expect(uv.getY(last)).toBeCloseTo(1, 6);
    }

    geometry.dispose();
  });

  it('synchronizes displacement scale/bias, customDepthMaterial, and stretcher frame', () => {
    const project = createDefaultProject({
      canvas: {
        widthCm: 50,
        heightCm: 70,
        widthPx: 100,
        heightPx: 140,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });

    const registry = new MapRegistry();
    registry.allocate(project.canvas.widthPx, project.canvas.heightPx);
    const textures = new MapTextures(registry, createMockRenderer());

    const canvasMesh = new CanvasMesh(textures, project.canvas, project.material, project.view3d);

    let stats = canvasMesh.getStats();
    expect(stats.boundingBoxSizeCm.x).toBeCloseTo(50, 6);
    expect(stats.boundingBoxSizeCm.y).toBeCloseTo(70, 6);
    expect(stats.displacement.maxDisplacementCm).toBeCloseTo(0.5, 6);
    expect(canvasMesh.paintMaterial.displacementScale).toBeCloseTo(0.5, 6);
    expect(canvasMesh.paintDepthMaterial.displacementScale).toBeCloseTo(0.5, 6);
    expect(canvasMesh.frontMesh.castShadow).toBe(true);
    expect(canvasMesh.frontMesh.receiveShadow).toBe(true);
    expect(canvasMesh.frontMesh.customDepthMaterial).toBe(canvasMesh.paintDepthMaterial);
    expect(stats.frameVisible).toBe(true);

    // Update reliefMultiplier=4, min=1mm, max=5mm -> max displacement = (5 / 10) * 4 = 2.0 cm
    const updatedCanvas = { ...project.canvas, minThicknessMm: 1, maxThicknessMm: 5 };
    const updatedView3d = {
      ...project.view3d,
      reliefMultiplier: 4,
      meshDetail: 256 as const,
      showFrame: false,
    };
    canvasMesh.update(textures, updatedCanvas, project.material, updatedView3d);

    const expectedDisp = computeDisplacementParams(1, 5, 4);
    expect(expectedDisp.maxDisplacementCm).toBeCloseTo(2.0, 6);

    stats = canvasMesh.getStats();
    expect(stats.displacement.displacementBias).toBeCloseTo(0.4, 6);
    expect(stats.displacement.displacementScale).toBeCloseTo(1.6, 6);
    expect(stats.displacement.maxDisplacementCm).toBeCloseTo(2.0, 6);
    expect(canvasMesh.paintMaterial.displacementBias).toBeCloseTo(0.4, 6);
    expect(canvasMesh.paintMaterial.displacementScale).toBeCloseTo(1.6, 6);
    expect(canvasMesh.paintDepthMaterial.displacementBias).toBeCloseTo(0.4, 6);
    expect(canvasMesh.paintDepthMaterial.displacementScale).toBeCloseTo(1.6, 6);
    expect(stats.segY).toBe(256);
    expect(stats.frameVisible).toBe(false);

    canvasMesh.dispose();
    textures.dispose();
  });
});
