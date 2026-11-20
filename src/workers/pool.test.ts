import { describe, expect, it } from 'vitest';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';
import { gaussianBlurFloat32, gaussianBlurRegionRgba8 } from '@/imaging/blur';
import {
  resampleFloatWithTransform,
  resampleMaskUint8,
  resampleRgbaWithTransform,
} from '@/imaging/resample';
import { laplaceSmoothFloat32Region, laplaceSmoothRgba8Region } from '@/imaging/smooth';
import { createDefaultTransform } from '@/imaging/transform';
import {
  blurRegionParallel,
  computeEffectiveColorParallel,
  computeEffectiveHeightParallel,
  computeEffectiveOpacityParallel,
  fitAndResampleMapParallel,
  getWorkerPoolStats,
  resampleMaskParallel,
  resetWorkerPoolStats,
  resolveOptimalPoolSize,
  resizeProjectMapsParallel,
  smoothFloatMapParallel,
  smoothRegionParallel,
} from '@/workers/pool';

describe('worker pool stripe orchestration & fallback equivalence', () => {
  it('computes effective color, height, and opacity identically to direct adjustments', async () => {
    resetWorkerPoolStats();
    const w = 160;
    const h = 300;
    const rgbaWorking = new Uint8ClampedArray(w * h * 4);
    const heightWorking = new Float32Array(w * h);
    const opacityWorking = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const p = i * 4;
        rgbaWorking[p] = (x * 7 + y * 3) % 256;
        rgbaWorking[p + 1] = (x * 5 + y * 11) % 256;
        rgbaWorking[p + 2] = (x * 13 + y) % 256;
        rgbaWorking[p + 3] = 255;
        heightWorking[i] = ((x + y) % 100) / 99;
        opacityWorking[i] = ((x * 3 + y * 2) % 100) / 99;
      }
    }

    const colorParams = { brightness: 0.15, contrast: 0.25, saturation: -0.35 };
    const heightParams = { invert: true, contrast: 0.2, gamma: 1.4 };
    const opacityParams = {
      invert: false,
      contrast: 0.3,
      maxTransmissionPct: 90,
      maxOpacityPct: 80,
    };

    const refColor = new Uint8ClampedArray(w * h * 4);
    applyColorAdjustments(rgbaWorking, refColor, w, h, colorParams);
    const poolColor = await computeEffectiveColorParallel(rgbaWorking, w, h, colorParams);
    expect(poolColor).toEqual(refColor);

    const refHeight = new Float32Array(w * h);
    applyHeightAdjustments(heightWorking, refHeight, w, h, heightParams);
    const poolHeight = await computeEffectiveHeightParallel(heightWorking, w, h, heightParams);
    expect(poolHeight).toEqual(refHeight);

    const refOpacity = new Float32Array(w * h);
    applyOpacityAdjustments(opacityWorking, refOpacity, w, h, opacityParams);
    const poolOpacity = await computeEffectiveOpacityParallel(opacityWorking, w, h, opacityParams);
    expect(poolOpacity).toEqual(refOpacity);

    const stats = getWorkerPoolStats();
    expect(stats.totalJobs).toBe(3);
    expect(stats.lastDurationsMs.computeEffectiveColor).not.toBeNull();
    expect(stats.lastDurationsMs.computeEffectiveHeight).not.toBeNull();
    expect(stats.lastDurationsMs.computeEffectiveOpacity).not.toBeNull();
  });

  it('blurs and smooths float32 and rgba8 across row-stripe seams bit-for-bit', async () => {
    const w = 128;
    const h = 320;
    const scalar = new Float32Array(w * h);
    const rgba8 = new Uint8ClampedArray(w * h * 4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const val = (Math.sin(x * 0.13) * Math.cos(y * 0.09) + 1) * 0.5;
        scalar[i] = val;
        const p = i * 4;
        rgba8[p] = Math.round(val * 255);
        rgba8[p + 1] = ((x * 9 + y) % 256) & 255;
        rgba8[p + 2] = ((x + y * 7) % 256) & 255;
        rgba8[p + 3] = 255;
      }
    }

    const refSmoothFloat = gaussianBlurFloat32(scalar, w, h, 4.5);
    const poolSmoothFloat = await smoothFloatMapParallel(scalar, w, h, 4.5);
    for (let i = 0; i < refSmoothFloat.length; i++) {
      expect(poolSmoothFloat[i]).toBeCloseTo(refSmoothFloat[i] ?? 0, 5);
    }

    const rect = { x: 16, y: 20, w: 96, h: 260 };
    const refBlurRgba = gaussianBlurRegionRgba8(rgba8, w, h, rect, 5);
    const poolBlurRgba = await blurRegionParallel({
      mapId: 'color',
      rgba8,
      width: w,
      height: h,
      rect,
      radiusPx: 5,
    });
    expect(poolBlurRgba.rgba8).toEqual(refBlurRgba);

    const refLaplaceFloat = laplaceSmoothFloat32Region(scalar, w, h, rect, 4);
    const poolLaplaceFloat = await smoothRegionParallel({
      mapId: 'height',
      scalar,
      width: w,
      height: h,
      rect,
      iterations: 4,
    });
    expect(poolLaplaceFloat.scalar).toEqual(refLaplaceFloat);

    const refLaplaceRgba = laplaceSmoothRgba8Region(rgba8, w, h, rect, 4);
    const poolLaplaceRgba = await smoothRegionParallel({
      mapId: 'color',
      rgba8,
      width: w,
      height: h,
      rect,
      iterations: 4,
    });
    expect(poolLaplaceRgba.rgba8).toEqual(refLaplaceRgba);
  });

  it('resamples and resizes project maps with stripe equivalence', async () => {
    const srcW = 64;
    const srcH = 96;
    const dstW = 90;
    const dstH = 260;
    const color = new Uint8ClampedArray(srcW * srcH * 4);
    const scalar = new Float32Array(srcW * srcH);
    const selection = new Uint8Array(srcW * srcH);

    for (let i = 0; i < srcW * srcH; i++) {
      color[i * 4] = (i * 17) % 256;
      color[i * 4 + 1] = (i * 31) % 256;
      color[i * 4 + 2] = (i * 47) % 256;
      color[i * 4 + 3] = 255;
      scalar[i] = (i % 101) / 100;
      selection[i] = i % 3 === 0 ? 255 : 0;
    }

    const transform = createDefaultTransform(srcW, srcH);
    const refRgba = resampleRgbaWithTransform({
      src: color,
      srcWidth: srcW,
      srcHeight: srcH,
      dstWidth: dstW,
      dstHeight: dstH,
      fit: 'stretch',
      transform,
    });
    const poolRgba = await fitAndResampleMapParallel({
      mapId: 'color',
      rgba8: color,
      srcWidth: srcW,
      srcHeight: srcH,
      dstWidth: dstW,
      dstHeight: dstH,
      fit: 'stretch',
      transform,
    });
    expect(poolRgba.rgba8).toEqual(refRgba);

    const refFloat = resampleFloatWithTransform({
      src: scalar,
      srcWidth: srcW,
      srcHeight: srcH,
      dstWidth: dstW,
      dstHeight: dstH,
      fit: 'stretch',
      transform,
    });
    const poolFloat = await fitAndResampleMapParallel({
      mapId: 'height',
      gray16: scalar,
      srcWidth: srcW,
      srcHeight: srcH,
      dstWidth: dstW,
      dstHeight: dstH,
      fit: 'stretch',
      transform,
    });
    expect(poolFloat.float32).toEqual(refFloat);

    const refMask = resampleMaskUint8(selection, srcW, srcH, dstW, dstH);
    const poolMask = await resampleMaskParallel({
      selection,
      srcWidth: srcW,
      srcHeight: srcH,
      dstWidth: dstW,
      dstHeight: dstH,
    });
    expect(poolMask).toEqual(refMask);

    const resized = await resizeProjectMapsParallel({
      srcWidth: srcW,
      srcHeight: srcH,
      dstWidth: dstW,
      dstHeight: dstH,
      colorBase: color,
      colorWorking: color,
      heightBase: scalar,
      heightWorking: scalar,
      opacityBase: scalar,
      opacityWorking: scalar,
      selection,
      adjustments: {
        color: { brightness: 0.1, contrast: 0, saturation: 0 },
        height: { invert: false, contrast: 0, gamma: 1 },
        opacity: { invert: false, contrast: 0, maxTransmissionPct: 100, maxOpacityPct: 100 },
      },
    });
    expect(resized.colorEffective.length).toBe(dstW * dstH * 4);
    expect(resized.heightEffective.length).toBe(dstW * dstH);
    expect(resized.selection).toEqual(refMask);
    expect(resolveOptimalPoolSize(dstH)).toBeGreaterThanOrEqual(1);
  });
});
