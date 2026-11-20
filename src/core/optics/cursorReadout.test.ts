import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import { computeBeerLambertTransmission, srgbBytesToLinearRgb } from '@/core/optics/beerLambert';
import { sampleCursorReadout } from '@/core/optics/cursorReadout';

describe('sampleCursorReadout', () => {
  it('computes calibrated cm, uppercase hex, float & L8 height mm, opacity %, and luminance back T %', () => {
    const project = createDefaultProject({
      canvas: {
        widthCm: 50,
        heightCm: 70,
        widthPx: 3000,
        heightPx: 4200,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });

    const width = 4;
    const height = 4;
    const colorEffective = new Uint8ClampedArray(width * height * 4);
    const heightEffective = new Float32Array(width * height);
    const opacityEffective = new Float32Array(width * height);

    // Sample pixel (2, 1) -> idx 6
    const idx = 1 * width + 2;
    colorEffective[idx * 4] = 0xa3;
    colorEffective[idx * 4 + 1] = 0xb1;
    colorEffective[idx * 4 + 2] = 0xc2;
    colorEffective[idx * 4 + 3] = 255;
    heightEffective[idx] = 0.5;
    opacityEffective[idx] = 0.642;

    const readout = sampleCursorReadout({
      imageX: 2.75,
      imageY: 1.25,
      width,
      height,
      colorEffective,
      heightEffective,
      opacityEffective,
      canvas: project.canvas,
      material: project.material,
      back: project.lighting.back,
    });

    expect(readout).not.toBeNull();
    expect(readout?.xPx).toBe(2);
    expect(readout?.yPx).toBe(1);
    expect(readout?.xCm).toBeCloseTo(2 / 60, 6);
    expect(readout?.yCm).toBeCloseTo(1 / 60, 6);
    expect(readout?.hex).toBe('#A3B1C2');
    expect(readout?.heightMm).toBeCloseTo(2.5, 5);
    expect(readout?.heightMm.toFixed(3)).toBe('2.500');
    expect(readout?.level8).toBe(128);
    expect(readout?.heightMmQuantized.toFixed(3)).toBe('2.510');
    expect(readout?.opacityPct).toBeCloseTo(64.2, 4);

    const expectedT = computeBeerLambertTransmission({
      heightNorm: 0.5,
      opacityTau: 0.642,
      colorLinear: srgbBytesToLinearRgb(0xa3, 0xb1, 0xc2),
      canvas: project.canvas,
      material: project.material,
      globalTransmissionPct: project.lighting.back.globalTransmissionPct,
      attenuation: project.lighting.back.attenuation,
    });
    const expectedLumPct =
      (0.2126 * expectedT.total.r + 0.7152 * expectedT.total.g + 0.0722 * expectedT.total.b) * 100;
    expect(readout?.backTransmissionPct).toBeCloseTo(expectedLumPct, 6);
  });

  it('matches spec cm coordinates at (1234, 2100) on 50x70 cm / 3000x4200 px and returns null out of bounds', () => {
    const project = createDefaultProject();
    const n = 2;
    const colorEffective = new Uint8ClampedArray(n * 4);
    const heightEffective = new Float32Array(n);
    const opacityEffective = new Float32Array(n);

    expect(
      sampleCursorReadout({
        imageX: -0.01,
        imageY: 0,
        width: 2,
        height: 1,
        colorEffective,
        heightEffective,
        opacityEffective,
        canvas: project.canvas,
        material: project.material,
        back: project.lighting.back,
      }),
    ).toBeNull();

    expect(
      sampleCursorReadout({
        imageX: 2,
        imageY: 0,
        width: 2,
        height: 1,
        colorEffective,
        heightEffective,
        opacityEffective,
        canvas: project.canvas,
        material: project.material,
        back: project.lighting.back,
      }),
    ).toBeNull();

    // Zero opacity -> 0 back T %
    opacityEffective[1] = 0;
    const zeroOp = sampleCursorReadout({
      imageX: 1.5,
      imageY: 0.5,
      width: 2,
      height: 1,
      colorEffective,
      heightEffective,
      opacityEffective,
      canvas: project.canvas,
      material: project.material,
      back: project.lighting.back,
    });
    expect(zeroOp?.opacityPct).toBe(0);
    expect(zeroOp?.backTransmissionPct).toBe(0);
  });
});
