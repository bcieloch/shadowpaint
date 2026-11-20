import { describe, expect, it } from 'vitest';
import { createDefaultProject, FRONT_LIGHT_INTENSITY_FACTOR } from '@/core/constants';
import {
  clampShadowMapSize,
  computeFrontShadowParams,
  computeFrontSpotIntensity,
  frontLightToPolar,
  frontLightToWorld,
  polarToFrontLightCartesian,
} from '@/core/units/lighting';

describe('Front light coordinate & shadow calibration math', () => {
  const project = createDefaultProject();
  const canvas = project.canvas; // 50 x 70 cm

  it('maps default Cartesian front light coordinates to world cm coordinates', () => {
    const world = frontLightToWorld(project.lighting.front, canvas);
    expect(world.position).toEqual({ x: 0, y: 65, z: 60 });
    expect(world.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(world.distanceToTargetCm).toBeCloseTo(Math.hypot(65, 60), 6);
  });

  it('converts Cartesian -> Polar with azimuth 0° above, +90° right, ±180° below, -90° left', () => {
    // Straight above center (+Y): azimuth 0°, incidence atan2(65, 60)
    const above = frontLightToPolar(project.lighting.front, canvas);
    expect(above.azimuthDeg).toBeCloseTo(0, 6);
    expect(above.incidenceDeg).toBeCloseTo((Math.atan2(65, 60) * 180) / Math.PI, 6);

    // Right of center (+X, Y=center=35 -> heightAboveTop = -35)
    const right = frontLightToPolar(
      { xCm: 65, heightAboveTopCm: -35, distanceCm: 40, targetXCm: 25, targetYCm: 35 },
      canvas,
    );
    expect(right.azimuthDeg).toBeCloseTo(90, 6);
    expect(right.incidenceDeg).toBeCloseTo(45, 6);
    expect(right.distanceToTargetCm).toBeCloseTo(Math.hypot(40, 40), 6);

    // Left of center (-X)
    const left = frontLightToPolar(
      { xCm: -15, heightAboveTopCm: -35, distanceCm: 40, targetXCm: 25, targetYCm: 35 },
      canvas,
    );
    expect(left.azimuthDeg).toBeCloseTo(-90, 6);
    expect(left.incidenceDeg).toBeCloseTo(45, 6);

    // Below center (-Y)
    const below = frontLightToPolar(
      { xCm: 25, heightAboveTopCm: -85, distanceCm: 50, targetXCm: 25, targetYCm: 35 },
      canvas,
    );
    expect(Math.abs(below.azimuthDeg)).toBeCloseTo(180, 6);
    expect(below.incidenceDeg).toBeCloseTo(45, 6);
  });

  it('round-trips Polar -> Cartesian -> Polar accurately across arbitrary targets', () => {
    const cases = [
      { incidenceDeg: 0, azimuthDeg: 0, distanceToTargetCm: 80, tx: 25, ty: 35 },
      { incidenceDeg: 37.5, azimuthDeg: 42, distanceToTargetCm: 95, tx: 12, ty: 58 },
      { incidenceDeg: 62, azimuthDeg: -135, distanceToTargetCm: 70, tx: 40, ty: 15 },
      { incidenceDeg: 85, azimuthDeg: -25, distanceToTargetCm: 120, tx: 25, ty: 35 },
    ];

    for (const c of cases) {
      const cart = polarToFrontLightCartesian(
        {
          incidenceDeg: c.incidenceDeg,
          azimuthDeg: c.azimuthDeg,
          distanceToTargetCm: c.distanceToTargetCm,
        },
        c.tx,
        c.ty,
        canvas,
      );
      const polarBack = frontLightToPolar({ ...cart, targetXCm: c.tx, targetYCm: c.ty }, canvas);
      expect(polarBack.incidenceDeg).toBeCloseTo(c.incidenceDeg, 4);
      expect(polarBack.distanceToTargetCm).toBeCloseTo(c.distanceToTargetCm, 4);
      if (c.incidenceDeg > 0.01) {
        expect(polarBack.azimuthDeg).toBeCloseTo(c.azimuthDeg, 4);
      }
    }
  });

  it('calibrates SpotLight intensity by r^2 * FRONT_LIGHT_INTENSITY_FACTOR and shadow params', () => {
    expect(computeFrontSpotIntensity(1, 50)).toBeCloseTo(2500 * FRONT_LIGHT_INTENSITY_FACTOR, 6);
    expect(clampShadowMapSize(8192, 4096)).toBe(4096);
    expect(clampShadowMapSize(4096, 2048)).toBe(2048);
    expect(clampShadowMapSize(8192, 8192)).toBe(8192);

    const shadow = computeFrontShadowParams(
      { sourceSizeCm: 10, coneAngleDeg: 60, shadowMapSize: 4096 },
      canvas,
      100,
      4096,
    );
    const diag = Math.hypot(50, 70);
    expect(shadow.radius).toBeCloseTo(6, 6);
    expect(shadow.near).toBeCloseTo(100 - diag, 6);
    expect(shadow.far).toBeCloseTo(100 + diag, 6);
    expect(shadow.bias).toBe(-0.0001);
    expect(shadow.normalBias).toBeCloseTo(0.5 * shadow.texelWorldSize, 6);
  });
});
