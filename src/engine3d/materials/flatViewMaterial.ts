import * as THREE from 'three';
import colormapsGlsl from '@/engine3d/shaders/colormaps.glsl?raw';
import flatViewFragGlsl from '@/engine3d/shaders/flatView.frag.glsl?raw';
import flatViewVertGlsl from '@/engine3d/shaders/flatView.vert.glsl?raw';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export type FlatViewShaderMode = 0 | 1 | 2 | 3 | 4;

export interface FlatViewUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uColorMap: THREE.IUniform<THREE.Texture>;
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uOpacityMap: THREE.IUniform<THREE.Texture>;
  uMode: THREE.IUniform<number>;
  uMinMm: THREE.IUniform<number>;
  uMaxMm: THREE.IUniform<number>;
  uContourStepMm: THREE.IUniform<number>;
}

export function createCanvasQuadGeometry(widthCm: number, heightCm: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(widthCm, heightCm, 1, 1);
  const uv = geo.attributes.uv;
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      uv.setY(i, 1 - uv.getY(i));
    }
    uv.needsUpdate = true;
  }
  return geo;
}

export function createFlatViewMaterial(textures: MapTextures): THREE.ShaderMaterial {
  const uniforms: FlatViewUniforms = {
    uColorMap: { value: textures.colorTex },
    uHeightMap: { value: textures.heightTex },
    uOpacityMap: { value: textures.opacityTex },
    uMode: { value: 0 },
    uMinMm: { value: 0 },
    uMaxMm: { value: 5 },
    uContourStepMm: { value: 0.5 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: flatViewVertGlsl,
    fragmentShader: `${colormapsGlsl}\n${flatViewFragGlsl}`,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
}

export function resolveFlatViewShaderMode(
  viewMode2D: 'color' | 'height' | 'opacity',
  heightDisplay: 'gray' | 'heat' | 'topo',
): FlatViewShaderMode {
  if (viewMode2D === 'color') return 0;
  if (viewMode2D === 'opacity') return 4;
  if (heightDisplay === 'gray') return 1;
  if (heightDisplay === 'heat') return 2;
  return 3;
}
