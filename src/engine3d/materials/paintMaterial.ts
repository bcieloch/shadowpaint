import * as THREE from 'three';
import type { CanvasSettings, GridSettings, MaterialSettings, View3DSettings } from '@/core/types';
import { computeDisplacementParams, getCalibrationMetrics } from '@/core/units/calibration';
import type { BackLightShaderParams } from '@/engine3d/lights/BackLight';
import backlightFragGlsl from '@/engine3d/shaders/backlight.frag.glsl?raw';
import gridFragGlsl from '@/engine3d/shaders/grid.frag.glsl?raw';
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
  uGridEnabled: THREE.IUniform<number>;
  uGridSpacingCm: THREE.IUniform<number>;
  uGridSubdivisions: THREE.IUniform<number>;
  uGridColor: THREE.IUniform<THREE.Color>;
  uGridOpacity: THREE.IUniform<number>;
  uGridCanvasCm: THREE.IUniform<THREE.Vector2>;
  uPcssRadiusScale: THREE.IUniform<number>;
}

export interface PaintPcssOptions {
  enabled: boolean;
  radiusScale: number;
}

const PAINT_UNIFORMS_KEY = 'paintUniforms';
const PAINT_PCSS_ENABLED_KEY = 'paintPcssEnabled';

const PCF_ORIGINAL_FIVE_TAP_REGEX =
  /vec2 texelSize = vec2\(\s*1\.0\s*\)\s*\/\s*shadowMapSize;\s*vec2 radius = shadowRadius \* texelSize;[\s\S]*?shadow = \(\s*texture\( shadowMap,[\s\S]*?\)\s*\*\s*0\.2;/;

const PCSS_VOGEL_SIXTEEN_TAP = `vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				vec2 radius = shadowRadius * uPcssRadiusScale * texelSize;

				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = 0.0;
				for ( int pcssIdx = 0; pcssIdx < 16; pcssIdx ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( pcssIdx, 16, phi ) * radius, shadowCoord.z ) );
				}
				shadow *= 0.0625;`;

function buildPcssShadowMapParsChunk(): string {
  const baseChunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (!PCF_ORIGINAL_FIVE_TAP_REGEX.test(baseChunk)) {
    return baseChunk;
  }
  return baseChunk.replace(PCF_ORIGINAL_FIVE_TAP_REGEX, PCSS_VOGEL_SIXTEEN_TAP);
}

export function createPaintMaterial(
  textures: MapTextures,
  canvas: CanvasSettings,
  materialSettings: MaterialSettings,
  view3d: View3DSettings,
  backParams?: BackLightShaderParams,
  grid?: GridSettings,
  pcssOptions?: PaintPcssOptions,
): THREE.MeshStandardMaterial {
  const disp = computeDisplacementParams(
    canvas.minThicknessMm,
    canvas.maxThicknessMm,
    view3d.reliefMultiplier,
  );
  const { pxPerCm } = getCalibrationMetrics(canvas);
  const pcssEnabled = Boolean(pcssOptions?.enabled);

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
    uScatterRadiusTex: { value: Math.max(0, materialSettings.scatterRadiusMm / 10) * pxPerCm },
    uGridEnabled: { value: grid?.show3D ? 1 : 0 },
    uGridSpacingCm: { value: Math.max(0.05, grid?.spacingCm ?? 5) },
    uGridSubdivisions: { value: Math.max(1, grid?.subdivisions ?? 5) },
    uGridColor: { value: new THREE.Color(grid?.color ?? '#f59e0b') },
    uGridOpacity: { value: grid?.opacity ?? 0.35 },
    uGridCanvasCm: { value: new THREE.Vector2(canvas.widthCm, canvas.heightCm) },
    uPcssRadiusScale: { value: Math.max(0.5, pcssOptions?.radiusScale ?? 1) },
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
  material.userData[PAINT_PCSS_ENABLED_KEY] = pcssEnabled;
  material.customProgramCacheKey = () =>
    material.userData[PAINT_PCSS_ENABLED_KEY]
      ? 'shadowpaint-paint-v4-pcss'
      : 'shadowpaint-paint-v4';

  material.onBeforeCompile = (shader) => {
    const compileWithPcss = Boolean(material.userData[PAINT_PCSS_ENABLED_KEY]);
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
    shader.uniforms.uGridEnabled = paintUniforms.uGridEnabled;
    shader.uniforms.uGridSpacingCm = paintUniforms.uGridSpacingCm;
    shader.uniforms.uGridSubdivisions = paintUniforms.uGridSubdivisions;
    shader.uniforms.uGridColor = paintUniforms.uGridColor;
    shader.uniforms.uGridOpacity = paintUniforms.uGridOpacity;
    shader.uniforms.uGridCanvasCm = paintUniforms.uGridCanvasCm;
    shader.uniforms.uPcssRadiusScale = paintUniforms.uPcssRadiusScale;

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

    let fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uTexelSize;
uniform vec2 uTexelCm;
uniform float uDispScale;
uniform float uPcssRadiusScale;
${backlightFragGlsl}
${gridFragGlsl}`,
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
  float spGridAlpha = computeGridOverlayAlpha(vMapUv);
  if (spGridAlpha > 0.0) {
    outgoingLight = mix(outgoingLight, uGridColor, spGridAlpha);
  }
#endif
#include <opaque_fragment>`,
      );

    if (compileWithPcss) {
      fragmentShader = fragmentShader.replace(
        '#include <shadowmap_pars_fragment>',
        buildPcssShadowMapParsChunk(),
      );
    }

    shader.fragmentShader = fragmentShader;
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
  grid?: GridSettings,
  pcssOptions?: PaintPcssOptions,
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

  const nextPcssEnabled = Boolean(pcssOptions?.enabled);
  const prevPcssEnabled = Boolean(material.userData[PAINT_PCSS_ENABLED_KEY]);
  if (prevPcssEnabled !== nextPcssEnabled) {
    material.userData[PAINT_PCSS_ENABLED_KEY] = nextPcssEnabled;
    material.needsUpdate = true;
  }

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
    paintUniforms.uScatterRadiusTex.value =
      Math.max(0, materialSettings.scatterRadiusMm / 10) * pxPerCm;
    paintUniforms.uGridCanvasCm.value.set(canvas.widthCm, canvas.heightCm);
    paintUniforms.uPcssRadiusScale.value = Math.max(0.5, pcssOptions?.radiusScale ?? 1);

    if (backParams) {
      paintUniforms.uKAtt.value = backParams.attenuation;
      paintUniforms.uG.value = backParams.globalTransmission;
      paintUniforms.uBackPos.value.copy(backParams.position);
      paintUniforms.uBackColor.value.copy(backParams.colorLinear);
      paintUniforms.uBackIntensity.value = backParams.intensity;
      paintUniforms.uBackType.value = backParams.type === 'panel' ? 1 : 0;
      paintUniforms.uBackScale.value = backParams.backScale;
    }

    if (grid) {
      paintUniforms.uGridEnabled.value = grid.show3D ? 1 : 0;
      paintUniforms.uGridSpacingCm.value = Math.max(0.05, grid.spacingCm);
      paintUniforms.uGridSubdivisions.value = Math.max(1, grid.subdivisions);
      paintUniforms.uGridColor.value.set(grid.color);
      paintUniforms.uGridOpacity.value = grid.opacity;
    } else {
      paintUniforms.uGridEnabled.value = 0;
    }
  }
}
