import * as THREE from 'three';
import type { CanvasSettings, MaterialSettings, View3DSettings } from '@/core/types';
import { computeDisplacementParams, getCalibrationMetrics } from '@/core/units/calibration';
import type { BackLightShaderParams } from '@/engine3d/lights/BackLight';
import backlightFragGlsl from '@/engine3d/shaders/backlight.frag.glsl?raw';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export interface PaintMaterialUniforms {
  uHeight: THREE.IUniform<THREE.Texture>;
  uOpacity: THREE.IUniform<THREE.Texture>;
  uTexelSize: THREE.IUniform<THREE.Vector2>;
  uTexelCm: THREE.IUniform<THREE.Vector2>;
  uDispScale: THREE.IUniform<number>;
  uMinMm: THREE.IUniform<number>;
  uMaxMm: THREE.IUniform<number>;
  uMuA: THREE.IUniform<number>;
  uMuS: THREE.IUniform<number>;
  uKTint: THREE.IUniform<number>;
  uTauCanvas: THREE.IUniform<number>;
  uKAtt: THREE.IUniform<number>;
  uG: THREE.IUniform<number>;
  uBackPos: THREE.IUniform<THREE.Vector3>;
  uBackColor: THREE.IUniform<THREE.Color>;
  uBackIntensity: THREE.IUniform<number>;
  uBackType: THREE.IUniform<number>;
  uBackScale: THREE.IUniform<number>;
  uScatterRadiusTex: THREE.IUniform<number>;
}

const PAINT_UNIFORMS_KEY = 'paintUniforms';

export function createPaintMaterial(
  textures: MapTextures,
  canvas: CanvasSettings,
  materialSettings: MaterialSettings,
  view3d: View3DSettings,
  backParams?: BackLightShaderParams,
): THREE.MeshStandardMaterial {
  const disp = computeDisplacementParams(
    canvas.minThicknessMm,
    canvas.maxThicknessMm,
    view3d.reliefMultiplier,
  );
  const { pxPerCm } = getCalibrationMetrics(canvas);

  const paintUniforms: PaintMaterialUniforms = {
    uHeight: { value: textures.heightTex },
    uOpacity: { value: textures.opacityTex },
    uTexelSize: { value: new THREE.Vector2(1 / textures.width, 1 / textures.height) },
    uTexelCm: {
      value: new THREE.Vector2(canvas.widthCm / textures.width, canvas.heightCm / textures.height),
    },
    uDispScale: { value: disp.displacementScale },
    uMinMm: { value: canvas.minThicknessMm },
    uMaxMm: { value: canvas.maxThicknessMm },
    uMuA: { value: materialSettings.muA },
    uMuS: { value: materialSettings.muS },
    uKTint: { value: materialSettings.kTint },
    uTauCanvas: { value: materialSettings.canvasTransmittance },
    uKAtt: { value: backParams?.attenuation ?? 1 },
    uG: { value: backParams?.globalTransmission ?? 1 },
    uBackPos: { value: backParams ? backParams.position.clone() : new THREE.Vector3(0, 0, -20) },
    uBackColor: { value: backParams ? backParams.colorLinear.clone() : new THREE.Color(0xffffff) },
    uBackIntensity: { value: backParams?.intensity ?? 1 },
    uBackType: { value: backParams?.type === 'panel' ? 1 : 0 },
    uBackScale: { value: backParams?.backScale ?? 0 },
    uScatterRadiusTex: { value: (materialSettings.scatterRadiusMm / 10) * pxPerCm },
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
  material.customProgramCacheKey = () => 'shadowpaint-paint-v2';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHeight = paintUniforms.uHeight;
    shader.uniforms.uOpacity = paintUniforms.uOpacity;
    shader.uniforms.uTexelSize = paintUniforms.uTexelSize;
    shader.uniforms.uTexelCm = paintUniforms.uTexelCm;
    shader.uniforms.uDispScale = paintUniforms.uDispScale;
    shader.uniforms.uMinMm = paintUniforms.uMinMm;
    shader.uniforms.uMaxMm = paintUniforms.uMaxMm;
    shader.uniforms.uMuA = paintUniforms.uMuA;
    shader.uniforms.uMuS = paintUniforms.uMuS;
    shader.uniforms.uKTint = paintUniforms.uKTint;
    shader.uniforms.uTauCanvas = paintUniforms.uTauCanvas;
    shader.uniforms.uKAtt = paintUniforms.uKAtt;
    shader.uniforms.uG = paintUniforms.uG;
    shader.uniforms.uBackPos = paintUniforms.uBackPos;
    shader.uniforms.uBackColor = paintUniforms.uBackColor;
    shader.uniforms.uBackIntensity = paintUniforms.uBackIntensity;
    shader.uniforms.uBackType = paintUniforms.uBackType;
    shader.uniforms.uBackScale = paintUniforms.uBackScale;
    shader.uniforms.uScatterRadiusTex = paintUniforms.uScatterRadiusTex;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPaintWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vPaintWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uTexelSize;
uniform vec2 uTexelCm;
uniform float uDispScale;
${backlightFragGlsl}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
#ifdef USE_MAP
  float spHL = clamp(texture2D(uHeight, vMapUv - vec2(uTexelSize.x, 0.0)).r, 0.0, 1.0);
  float spHR = clamp(texture2D(uHeight, vMapUv + vec2(uTexelSize.x, 0.0)).r, 0.0, 1.0);
  float spHU = clamp(texture2D(uHeight, vMapUv - vec2(0.0, uTexelSize.y)).r, 0.0, 1.0);
  float spHD = clamp(texture2D(uHeight, vMapUv + vec2(0.0, uTexelSize.y)).r, 0.0, 1.0);
  float spGx = (spHR - spHL) * uDispScale / (2.0 * max(uTexelCm.x, 1e-6));
  float spGyImg = (spHD - spHU) * uDispScale / (2.0 * max(uTexelCm.y, 1e-6));
  vec3 spNObj = normalize(vec3(-spGx, spGyImg, 1.0));
  normal = normalize(mat3(viewMatrix) * spNObj);
  nonPerturbedNormal = normal;
#endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#ifdef USE_MAP
  outgoingLight += computeBackLightContribution(vMapUv, diffuseColor.rgb, vPaintWorldPos);
#endif
#include <opaque_fragment>`,
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
  backParams?: BackLightShaderParams,
): void {
  const disp = computeDisplacementParams(
    canvas.minThicknessMm,
    canvas.maxThicknessMm,
    view3d.reliefMultiplier,
  );
  const { pxPerCm } = getCalibrationMetrics(canvas);

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
    paintUniforms.uMinMm.value = canvas.minThicknessMm;
    paintUniforms.uMaxMm.value = canvas.maxThicknessMm;
    paintUniforms.uMuA.value = materialSettings.muA;
    paintUniforms.uMuS.value = materialSettings.muS;
    paintUniforms.uKTint.value = materialSettings.kTint;
    paintUniforms.uTauCanvas.value = materialSettings.canvasTransmittance;
    paintUniforms.uScatterRadiusTex.value = (materialSettings.scatterRadiusMm / 10) * pxPerCm;

    if (backParams) {
      paintUniforms.uKAtt.value = backParams.attenuation;
      paintUniforms.uG.value = backParams.globalTransmission;
      paintUniforms.uBackPos.value.copy(backParams.position);
      paintUniforms.uBackColor.value.copy(backParams.colorLinear);
      paintUniforms.uBackIntensity.value = backParams.intensity;
      paintUniforms.uBackType.value = backParams.type === 'panel' ? 1 : 0;
      paintUniforms.uBackScale.value = backParams.backScale;
    }
  }
}
