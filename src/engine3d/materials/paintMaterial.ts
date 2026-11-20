import * as THREE from 'three';
import type { CanvasSettings, MaterialSettings, View3DSettings } from '@/core/types';
import { computeDisplacementParams } from '@/core/units/calibration';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export interface PaintMaterialUniforms {
  uHeightMap: THREE.IUniform<THREE.Texture>;
  uTexelSize: THREE.IUniform<THREE.Vector2>;
  uTexelCm: THREE.IUniform<THREE.Vector2>;
  uDispScale: THREE.IUniform<number>;
}

const PAINT_UNIFORMS_KEY = 'paintUniforms';

export function createPaintMaterial(
  textures: MapTextures,
  canvas: CanvasSettings,
  materialSettings: MaterialSettings,
  view3d: View3DSettings,
): THREE.MeshStandardMaterial {
  const disp = computeDisplacementParams(
    canvas.minThicknessMm,
    canvas.maxThicknessMm,
    view3d.reliefMultiplier,
  );

  const paintUniforms: PaintMaterialUniforms = {
    uHeightMap: { value: textures.heightTex },
    uTexelSize: { value: new THREE.Vector2(1 / textures.width, 1 / textures.height) },
    uTexelCm: {
      value: new THREE.Vector2(canvas.widthCm / textures.width, canvas.heightCm / textures.height),
    },
    uDispScale: { value: disp.displacementScale },
  };

  const material = new THREE.MeshStandardMaterial({
    map: textures.colorTex,
    roughness: materialSettings.roughness,
    metalness: 0,
    displacementMap: textures.heightTex,
    displacementScale: disp.displacementScale,
    displacementBias: disp.displacementBias,
  });

  material.userData[PAINT_UNIFORMS_KEY] = paintUniforms;
  material.customProgramCacheKey = () => 'shadowpaint-paint-v1';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHeightMap = paintUniforms.uHeightMap;
    shader.uniforms.uTexelSize = paintUniforms.uTexelSize;
    shader.uniforms.uTexelCm = paintUniforms.uTexelCm;
    shader.uniforms.uDispScale = paintUniforms.uDispScale;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uHeightMap;
uniform vec2 uTexelSize;
uniform vec2 uTexelCm;
uniform float uDispScale;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
#ifdef USE_MAP
  float spHL = clamp(texture2D(uHeightMap, vMapUv - vec2(uTexelSize.x, 0.0)).r, 0.0, 1.0);
  float spHR = clamp(texture2D(uHeightMap, vMapUv + vec2(uTexelSize.x, 0.0)).r, 0.0, 1.0);
  float spHU = clamp(texture2D(uHeightMap, vMapUv - vec2(0.0, uTexelSize.y)).r, 0.0, 1.0);
  float spHD = clamp(texture2D(uHeightMap, vMapUv + vec2(0.0, uTexelSize.y)).r, 0.0, 1.0);
  float spGx = (spHR - spHL) * uDispScale / (2.0 * max(uTexelCm.x, 1e-6));
  float spGyImg = (spHD - spHU) * uDispScale / (2.0 * max(uTexelCm.y, 1e-6));
  vec3 spNObj = normalize(vec3(-spGx, spGyImg, 1.0));
  normal = normalize(mat3(viewMatrix) * spNObj);
  nonPerturbedNormal = normal;
#endif`,
      );
  };

  return material;
}

export function updatePaintMaterial(
  material: THREE.MeshStandardMaterial,
  canvas: CanvasSettings,
  materialSettings: MaterialSettings,
  view3d: View3DSettings,
  texturesWidth: number,
  texturesHeight: number,
): void {
  const disp = computeDisplacementParams(
    canvas.minThicknessMm,
    canvas.maxThicknessMm,
    view3d.reliefMultiplier,
  );

  material.roughness = materialSettings.roughness;
  material.displacementScale = disp.displacementScale;
  material.displacementBias = disp.displacementBias;

  const paintUniforms = material.userData[PAINT_UNIFORMS_KEY] as PaintMaterialUniforms | undefined;
  if (paintUniforms) {
    paintUniforms.uTexelSize.value.set(1 / texturesWidth, 1 / texturesHeight);
    paintUniforms.uTexelCm.value.set(
      canvas.widthCm / texturesWidth,
      canvas.heightCm / texturesHeight,
    );
    paintUniforms.uDispScale.value = disp.displacementScale;
  }
}
