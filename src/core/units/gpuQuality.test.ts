import { describe, expect, it } from 'vitest';
import { selectDefaultQualityForGpu, selectRecommendedQuality } from '@/core/units/gpuQuality';
import type { GpuCapabilities } from '@/lib/webgl';

const baseCaps: GpuCapabilities = {
  webgl2: true,
  maxTextureSize: 8192,
  maxVertexTextureImageUnits: 16,
  maxFragmentTextureImageUnits: 16,
  maxCombinedTextureImageUnits: 32,
  maxAnisotropy: 8,
  renderer: 'ANGLE (NVIDIA GeForce RTX 4070)',
  vendor: 'Google Inc.',
  isSoftwareRenderer: false,
};

describe('gpuQuality', () => {
  it('selects balanced default quality on standard WebGL2 GPUs', () => {
    expect(selectDefaultQualityForGpu(baseCaps)).toEqual({
      meshDetail: 1024,
      shadowMapSize: 4096,
    });
  });

  it('downscales defaults on constrained GPUs or missing WebGL2', () => {
    expect(
      selectDefaultQualityForGpu({
        ...baseCaps,
        maxTextureSize: 2048,
      }),
    ).toEqual({
      meshDetail: 512,
      shadowMapSize: 2048,
    });

    expect(
      selectDefaultQualityForGpu({
        ...baseCaps,
        webgl2: false,
      }),
    ).toEqual({
      meshDetail: 512,
      shadowMapSize: 2048,
    });

    expect(
      selectDefaultQualityForGpu({
        ...baseCaps,
        maxVertexTextureImageUnits: 0,
      }),
    ).toEqual({
      meshDetail: 512,
      shadowMapSize: 2048,
    });
  });

  it('recommends ultra quality only for capable hardware GPUs', () => {
    expect(selectRecommendedQuality(baseCaps)).toEqual({
      meshDetail: 2048,
      shadowMapSize: 8192,
    });

    expect(
      selectRecommendedQuality({
        ...baseCaps,
        isSoftwareRenderer: true,
        renderer: 'Google SwiftShader',
      }),
    ).toEqual({
      meshDetail: 1024,
      shadowMapSize: 4096,
    });
  });
});
