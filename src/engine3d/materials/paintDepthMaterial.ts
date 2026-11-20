import * as THREE from 'three';

export function createPaintDepthMaterial(
  heightTex: THREE.Texture,
  displacementScale: number,
  displacementBias: number,
): THREE.MeshDepthMaterial {
  return new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    displacementMap: heightTex,
    displacementScale,
    displacementBias,
  });
}

export function updatePaintDepthMaterial(
  material: THREE.MeshDepthMaterial,
  displacementScale: number,
  displacementBias: number,
): void {
  material.displacementScale = displacementScale;
  material.displacementBias = displacementBias;
}
