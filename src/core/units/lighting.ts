import {
  FRONT_LIGHT_INTENSITY_FACTOR,
  MAX_CONE_ANGLE_DEG,
  MAX_INCIDENCE_DEG,
  MIN_CONE_ANGLE_DEG,
  MIN_INCIDENCE_DEG,
  MIN_SHADOW_DISTANCE_CM,
} from '@/core/constants';
import type { CanvasSettings, FrontLightSettings, ShadowMapSize } from '@/core/types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface FrontLightWorldMapping {
  position: Vec3;
  target: Vec3;
  distanceToTargetCm: number;
}

export interface PolarLightCoords {
  incidenceDeg: number;
  azimuthDeg: number;
  distanceToTargetCm: number;
}

export interface FrontShadowParams {
  mapSize: ShadowMapSize;
  radius: number;
  near: number;
  far: number;
  fov: number;
  bias: number;
  normalBias: number;
  texelWorldSize: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function frontLightToWorld(
  front: Pick<
    FrontLightSettings,
    'xCm' | 'heightAboveTopCm' | 'distanceCm' | 'targetXCm' | 'targetYCm'
  >,
  canvas: Pick<CanvasSettings, 'widthCm' | 'heightCm'>,
): FrontLightWorldMapping {
  const halfW = canvas.widthCm / 2;
  const halfH = canvas.heightCm / 2;

  const position: Vec3 = {
    x: front.xCm - halfW,
    y: halfH + front.heightAboveTopCm,
    z: front.distanceCm,
  };
  const target: Vec3 = {
    x: front.targetXCm - halfW,
    y: halfH - front.targetYCm,
    z: 0,
  };

  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const distanceToTargetCm = Math.max(1e-4, Math.hypot(dx, dy, dz));

  return { position, target, distanceToTargetCm };
}

export function frontLightToPolar(
  front: Pick<
    FrontLightSettings,
    'xCm' | 'heightAboveTopCm' | 'distanceCm' | 'targetXCm' | 'targetYCm'
  >,
  canvas: Pick<CanvasSettings, 'widthCm' | 'heightCm'>,
): PolarLightCoords {
  const { position, target, distanceToTargetCm } = frontLightToWorld(front, canvas);
  const vx = position.x - target.x;
  const vy = position.y - target.y;
  const vz = position.z - target.z;

  const cosTheta = clampNumber(vz / distanceToTargetCm, -1, 1);
  const incidenceDeg = Math.acos(cosTheta) * RAD_TO_DEG;

  // At theta ≈ 0 (straight in front along +Z), atan2(0, 0) = 0 (top azimuth convention)
  const azimuthDeg =
    Math.abs(vx) < 1e-8 && Math.abs(vy) < 1e-8 ? 0 : Math.atan2(vx, vy) * RAD_TO_DEG;

  return {
    incidenceDeg,
    azimuthDeg,
    distanceToTargetCm,
  };
}

export function polarToFrontLightCartesian(
  polar: PolarLightCoords,
  targetXCm: number,
  targetYCm: number,
  canvas: Pick<CanvasSettings, 'widthCm' | 'heightCm'>,
): Pick<FrontLightSettings, 'xCm' | 'heightAboveTopCm' | 'distanceCm'> {
  const halfW = canvas.widthCm / 2;
  const halfH = canvas.heightCm / 2;

  const r = Math.max(MIN_SHADOW_DISTANCE_CM, polar.distanceToTargetCm);
  const theta = clampNumber(polar.incidenceDeg, MIN_INCIDENCE_DEG, MAX_INCIDENCE_DEG) * DEG_TO_RAD;
  const phi = polar.azimuthDeg * DEG_TO_RAD;

  const vx = r * Math.sin(theta) * Math.sin(phi);
  const vy = r * Math.sin(theta) * Math.cos(phi);
  const vz = r * Math.cos(theta);

  const targetWorldX = targetXCm - halfW;
  const targetWorldY = halfH - targetYCm;

  const posX = targetWorldX + vx;
  const posY = targetWorldY + vy;

  return {
    xCm: posX + halfW,
    heightAboveTopCm: posY - halfH,
    distanceCm: Math.max(MIN_SHADOW_DISTANCE_CM, vz),
  };
}

export function computeFrontSpotIntensity(intensity: number, distanceToTargetCm: number): number {
  const r = Math.max(MIN_SHADOW_DISTANCE_CM, distanceToTargetCm);
  return Math.max(0, intensity) * r * r * FRONT_LIGHT_INTENSITY_FACTOR;
}

export function clampShadowMapSize(
  requested: ShadowMapSize,
  maxTextureSize: number,
): ShadowMapSize {
  if (maxTextureSize >= 8192 && requested >= 8192) return 8192;
  if (maxTextureSize >= 4096 && requested >= 4096) return 4096;
  return 2048;
}

export function computeFrontShadowParams(
  front: Pick<FrontLightSettings, 'sourceSizeCm' | 'coneAngleDeg' | 'shadowMapSize'>,
  canvas: Pick<CanvasSettings, 'widthCm' | 'heightCm'>,
  distanceToTargetCm: number,
  maxTextureSize: number,
): FrontShadowParams {
  const r = Math.max(MIN_SHADOW_DISTANCE_CM, distanceToTargetCm);
  const diag = Math.hypot(canvas.widthCm, canvas.heightCm);
  const mapSize = clampShadowMapSize(front.shadowMapSize, maxTextureSize);
  const fov = clampNumber(front.coneAngleDeg, MIN_CONE_ANGLE_DEG, MAX_CONE_ANGLE_DEG);
  const radius = clampNumber(front.sourceSizeCm * 0.6, 1, 12);
  const near = Math.max(0.5, r - diag);
  const far = r + diag;
  const texelWorldSize = (2 * r * Math.tan((fov * DEG_TO_RAD) / 2)) / mapSize;
  const normalBias = 0.5 * texelWorldSize;

  return {
    mapSize,
    radius,
    near,
    far,
    fov,
    bias: -0.0001,
    normalBias,
    texelWorldSize,
  };
}
