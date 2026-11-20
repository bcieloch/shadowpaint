import type { MeshDetail, ShadowMapSize } from '@/core/types';
import { clampShadowMapSize } from '@/core/units/lighting';
import type { GpuCapabilities } from '@/lib/webgl';

export interface GpuQualityPreset {
  meshDetail: MeshDetail;
  shadowMapSize: ShadowMapSize;
}

/**
 * Selects safe initial 3D quality defaults for newly created projects based on probed WebGL2 limits.
 * Keeps standard desktop / SwiftShader environments at 1024 mesh / 4096 shadow while scaling down
 * on severely constrained GPUs.
 */
export function selectDefaultQualityForGpu(caps: GpuCapabilities): GpuQualityPreset {
  if (!caps.webgl2 || caps.maxTextureSize < 4096 || caps.maxVertexTextureImageUnits < 4) {
    return {
      meshDetail: 512,
      shadowMapSize: clampShadowMapSize(2048, caps.maxTextureSize),
    };
  }
  return {
    meshDetail: 1024,
    shadowMapSize: clampShadowMapSize(4096, caps.maxTextureSize),
  };
}

/**
 * Recommends an explicit GPU-matched quality preset for the Diagnostics "Optimize for GPU" action.
 */
export function selectRecommendedQuality(caps: GpuCapabilities): GpuQualityPreset {
  if (
    !caps.isSoftwareRenderer &&
    caps.webgl2 &&
    caps.maxTextureSize >= 8192 &&
    caps.maxVertexTextureImageUnits >= 16
  ) {
    return {
      meshDetail: 2048,
      shadowMapSize: clampShadowMapSize(8192, caps.maxTextureSize),
    };
  }
  return selectDefaultQualityForGpu(caps);
}
