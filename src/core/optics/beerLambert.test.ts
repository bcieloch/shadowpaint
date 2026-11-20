import { describe, expect, it } from 'vitest';
import { createDefaultProject, MATERIAL_PRESETS } from '@/core/constants';
import {
  applyMaterialPreset,
  computeBackLightIrradiance,
  computeBackLightRadiance,
  computeBeerLambertTransmission,
  linearRgbToSrgbBytes,
  sampleTransmissionCurve,
  srgbBytesToLinearRgb,
  transmissionLuminance,
} from '@/core/optics/beerLambert';

describe('beerLambert CPU optics', () => {
  it('returns G * tau_canvas * tau_p when d = 0 (minMm = 0, height = 0)', () => {
    const res = computeBeerLambertTransmission({
      heightNorm: 0,
      opacityTau: 0.8,
      colorLinear: { r: 0.5, g: 0.3, b: 0.2 },
      canvas: { minThicknessMm: 0, maxThicknessMm: 5 },
      material: { muA: 1.5, muS: 2.0, kTint: 0.85, canvasTransmittance: 0.65 },
      globalTransmissionPct: 120,
      attenuation: 1.4,
    });

    const expected = 1.2 * 0.65 * 0.8;
    expect(res.dMm).toBe(0);
    expect(res.scat).toEqual({ r: 0, g: 0, b: 0 });
    expect(res.total.r).toBeCloseTo(expected, 6);
    expect(res.total.g).toBeCloseTo(expected, 6);
    expect(res.total.b).toBeCloseTo(expected, 6);
  });

  it('returns 0 transmission when opacity tau_p = 0', () => {
    const res = computeBeerLambertTransmission({
      heightNorm: 0.4,
      opacityTau: 0,
      colorLinear: { r: 1, g: 1, b: 1 },
      canvas: { minThicknessMm: 0, maxThicknessMm: 5 },
      material: { muA: 0.9, muS: 0.6, kTint: 0.85, canvasTransmittance: 0.65 },
      globalTransmissionPct: 100,
      attenuation: 1,
    });

    expect(res.total).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('decreases transmission monotonically as paint thickness d increases', () => {
    const heights = [0, 0.1, 0.25, 0.5, 0.75, 1];
    const totals = heights.map((heightNorm) =>
      computeBeerLambertTransmission({
        heightNorm,
        opacityTau: 1,
        colorLinear: { r: 0.8, g: 0.2, b: 0.1 },
        canvas: { minThicknessMm: 0, maxThicknessMm: 5 },
        material: { muA: 0.9, muS: 0.6, kTint: 0.85, canvasTransmittance: 0.65 },
        globalTransmissionPct: 100,
        attenuation: 1,
      }),
    );

    for (let i = 1; i < totals.length; i++) {
      const prev = totals[i - 1];
      const curr = totals[i];
      expect(curr?.total.r).toBeLessThan(prev?.total.r ?? 0);
      expect(curr?.total.g).toBeLessThan(prev?.total.g ?? 0);
      expect(curr?.total.b).toBeLessThan(prev?.total.b ?? 0);
    }

    // Red pigment absorbs less red than blue
    const mid = totals[3];
    expect(mid?.total.r).toBeGreaterThan(mid?.total.b ?? 0);
  });

  it('normalizes point back light irradiance to I_b * color at the closest surface point', () => {
    const project = createDefaultProject({ canvas: { widthCm: 50, heightCm: 70 } });
    project.lighting.back.type = 'point';
    project.lighting.back.xCm = 25;
    project.lighting.back.yCm = 35;
    project.lighting.back.distanceBehindCm = 20;
    project.lighting.back.intensity = 1;
    project.lighting.back.color = { mode: 'rgb', kelvin: 5000, rgb: '#ffffff' };

    const centerIrradiance = computeBackLightIrradiance(
      { x: 0, y: 0, z: 0 },
      project.lighting.back,
      project.canvas,
    );
    expect(centerIrradiance.r).toBeCloseTo(1, 5);
    expect(centerIrradiance.g).toBeCloseTo(1, 5);
    expect(centerIrradiance.b).toBeCloseTo(1, 5);

    const offAxisIrradiance = computeBackLightIrradiance(
      { x: 20, y: 0, z: 0 },
      project.lighting.back,
      project.canvas,
    );
    expect(offAxisIrradiance.r).toBeLessThan(centerIrradiance.r);

    // Panel mode produces uniform irradiance across the entire canvas
    project.lighting.back.type = 'panel';
    const panelEdge = computeBackLightIrradiance(
      { x: 25, y: 35, z: 0 },
      project.lighting.back,
      project.canvas,
    );
    expect(panelEdge.r).toBeCloseTo(1, 5);
  });

  it('round-trips sRGB byte conversions cleanly for radiance evaluation', () => {
    const project = createDefaultProject({ canvas: { widthCm: 50, heightCm: 50 } });
    project.lighting.back.color = { mode: 'rgb', kelvin: 5000, rgb: '#ffffff' };
    const colorLinear = srgbBytesToLinearRgb(244, 241, 234);

    const radiance = computeBackLightRadiance({
      heightNorm: 0.5,
      opacityTau: 1,
      colorLinear,
      canvas: project.canvas,
      material: project.material,
      globalTransmissionPct: project.lighting.back.globalTransmissionPct,
      attenuation: project.lighting.back.attenuation,
      worldPosCm: { x: 0, y: 0, z: 0 },
      back: project.lighting.back,
      backScale: 1,
      canvasSizeCm: project.canvas,
    });

    const bytes = linearRgbToSrgbBytes(radiance);
    expect(bytes.r).toBeGreaterThan(20);
    expect(bytes.r).toBeLessThan(255);
  });

  it('applies documented material presets while preserving canvas backing settings', () => {
    const base = createDefaultProject().material;
    base.canvasTransmittance = 0.72;
    base.canvasBackColor = '#e0d6c6';

    for (const preset of MATERIAL_PRESETS) {
      const updated = applyMaterialPreset(base, preset.id);
      expect(updated.preset).toBe(preset.id);
      expect(updated.muA).toBe(preset.muA);
      expect(updated.muS).toBe(preset.muS);
      expect(updated.kTint).toBe(preset.kTint);
      expect(updated.roughness).toBe(preset.roughness);
      expect(updated.scatterRadiusMm).toBe(preset.scatterRadiusMm);
      expect(updated.canvasTransmittance).toBe(0.72);
      expect(updated.canvasBackColor).toBe('#e0d6c6');
    }

    const backToCustom = applyMaterialPreset(applyMaterialPreset(base, 'acrylicOpaque'), 'custom');
    expect(backToCustom.preset).toBe('custom');
    expect(backToCustom.muA).toBe(2.5);
  });

  it('samples T(d) curve in exact agreement with computeBeerLambertTransmission', () => {
    const material = { muA: 1.8, muS: 2.0, kTint: 0.9, canvasTransmittance: 0.65 };
    const curve = sampleTransmissionCurve({
      maxThicknessMm: 5,
      material,
      globalTransmissionPct: 150,
      attenuation: 1.2,
      tintHex: '#cc3322',
      steps: 11,
    });

    expect(curve).toHaveLength(11);
    expect(curve[0]?.dMm).toBeCloseTo(0, 6);
    expect(curve[0]?.whiteTotalPct).toBeCloseTo(150 * 0.65, 5);
    expect(curve[10]?.dMm).toBeCloseTo(5, 6);

    const mid = curve[5];
    const directWhite = computeBeerLambertTransmission({
      heightNorm: 0.5,
      opacityTau: 1,
      colorLinear: { r: 1, g: 1, b: 1 },
      canvas: { minThicknessMm: 0, maxThicknessMm: 5 },
      material,
      globalTransmissionPct: 150,
      attenuation: 1.2,
    });
    expect(mid?.whiteTotalPct).toBeCloseTo(transmissionLuminance(directWhite.total) * 100, 6);
    expect(mid?.tintTotalPct ?? 0).toBeLessThan(mid?.whiteTotalPct ?? 0);
  });
});
