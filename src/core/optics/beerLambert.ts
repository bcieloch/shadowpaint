import type { BackLightSettings, CanvasSettings, ColorSpec, MaterialSettings } from '@/core/types';
import { colorSpecToHex, hexToRgb01 } from '@/core/units/colorTemperature';
import { backLightToWorld, clampNumber, type Vec3 } from '@/core/units/lighting';

export interface RgbLinear {
  r: number;
  g: number;
  b: number;
}

export interface BeerLambertTransmission {
  dMm: number;
  alpha: RgbLinear;
  dir: RgbLinear;
  scat: RgbLinear;
  total: RgbLinear;
}

export interface BeerLambertPixelParams {
  heightNorm: number;
  opacityTau: number;
  colorLinear: RgbLinear;
  canvas: Pick<CanvasSettings, 'minThicknessMm' | 'maxThicknessMm'>;
  material: Pick<MaterialSettings, 'muA' | 'muS' | 'kTint' | 'canvasTransmittance'>;
  globalTransmissionPct: number;
  attenuation: number;
}

export interface BackLightPixelParams extends BeerLambertPixelParams {
  worldPosCm: Vec3;
  back: BackLightSettings;
  backScale?: number;
  canvasSizeCm: Pick<CanvasSettings, 'widthCm' | 'heightCm'>;
}

function clamp01(v: number): number {
  return clampNumber(v, 0, 1);
}

export function srgbChannelToLinear(c: number): number {
  const s = clamp01(c);
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function linearChannelToSrgb(c: number): number {
  const l = Math.max(0, c);
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return clamp01(s);
}

export function srgbBytesToLinearRgb(r8: number, g8: number, b8: number): RgbLinear {
  return {
    r: srgbChannelToLinear(r8 / 255),
    g: srgbChannelToLinear(g8 / 255),
    b: srgbChannelToLinear(b8 / 255),
  };
}

export function hexToLinearRgb(hex: string): RgbLinear {
  const rgb = hexToRgb01(hex);
  return {
    r: srgbChannelToLinear(rgb.r),
    g: srgbChannelToLinear(rgb.g),
    b: srgbChannelToLinear(rgb.b),
  };
}

export function colorSpecToLinearRgb(spec: ColorSpec): RgbLinear {
  return hexToLinearRgb(colorSpecToHex(spec));
}

export function linearRgbToSrgbBytes(rgb: RgbLinear): { r: number; g: number; b: number } {
  return {
    r: Math.round(linearChannelToSrgb(rgb.r) * 255),
    g: Math.round(linearChannelToSrgb(rgb.g) * 255),
    b: Math.round(linearChannelToSrgb(rgb.b) * 255),
  };
}

function computeChannelAlpha(muA: number, colorLinearChannel: number, kTint: number): number {
  const c = clamp01(colorLinearChannel);
  const tintFactor = 1 + kTint * (1 - 0.95 * c - 1);
  return Math.max(0, muA * tintFactor);
}

/**
 * Exact CPU mirror of `backlight.frag.glsl` Beer-Lambert transmittance (Stage 1, without scatter blur).
 */
export function computeBeerLambertTransmission(
  params: BeerLambertPixelParams,
): BeerLambertTransmission {
  const h = clamp01(params.heightNorm);
  const tauP = clamp01(params.opacityTau);
  const tauCanvas = clamp01(params.material.canvasTransmittance);
  const dMm = Math.max(
    0,
    params.canvas.minThicknessMm +
      h * (params.canvas.maxThicknessMm - params.canvas.minThicknessMm),
  );
  const G = Math.max(0, params.globalTransmissionPct / 100);
  const A = Math.max(0, params.attenuation);
  const muA = Math.max(0, params.material.muA);
  const muS = Math.max(0, params.material.muS);
  const kTint = clamp01(params.material.kTint);

  const alpha: RgbLinear = {
    r: computeChannelAlpha(muA, params.colorLinear.r, kTint),
    g: computeChannelAlpha(muA, params.colorLinear.g, kTint),
    b: computeChannelAlpha(muA, params.colorLinear.b, kTint),
  };

  const tauBase = G * tauCanvas * tauP;
  if (tauBase <= 0) {
    return {
      dMm,
      alpha,
      dir: { r: 0, g: 0, b: 0 },
      scat: { r: 0, g: 0, b: 0 },
      total: { r: 0, g: 0, b: 0 },
    };
  }

  const scatTerm = (1 - Math.exp(-A * muS * dMm)) * 0.5;
  const computeChannel = (a: number) => {
    const dir = tauBase * Math.exp(-A * (a + muS) * dMm);
    const scat = tauBase * Math.exp(-A * a * dMm) * scatTerm;
    return { dir, scat, total: dir + scat };
  };

  const r = computeChannel(alpha.r);
  const g = computeChannel(alpha.g);
  const b = computeChannel(alpha.b);

  return {
    dMm,
    alpha,
    dir: { r: r.dir, g: g.dir, b: b.dir },
    scat: { r: r.scat, g: g.scat, b: b.scat },
    total: { r: r.total, g: g.total, b: b.total },
  };
}

/**
 * Incident irradiance E (linear RGB) from the Back Light at world position P (cm).
 */
export function computeBackLightIrradiance(
  worldPosCm: Vec3,
  back: BackLightSettings,
  canvasSizeCm: Pick<CanvasSettings, 'widthCm' | 'heightCm'>,
): RgbLinear {
  const intensity = Math.max(0, back.intensity);
  if (intensity <= 0) {
    return { r: 0, g: 0, b: 0 };
  }
  const colorLinear = colorSpecToLinearRgb(back.color);
  if (back.type === 'panel') {
    return {
      r: intensity * colorLinear.r,
      g: intensity * colorLinear.g,
      b: intensity * colorLinear.b,
    };
  }

  const { position: lb, zDistanceCm } = backLightToWorld(back, canvasSizeCm);
  const dx = worldPosCm.x - lb.x;
  const dy = worldPosCm.y - lb.y;
  const dz = worldPosCm.z - lb.z;
  const distSq = Math.max(1e-4, dx * dx + dy * dy + dz * dz);
  const cosTheta = Math.max(0, dz / Math.sqrt(distSq));
  const factor = intensity * ((zDistanceCm * zDistanceCm) / distSq) * cosTheta;

  return {
    r: factor * colorLinear.r,
    g: factor * colorLinear.g,
    b: factor * colorLinear.b,
  };
}

/**
 * Linear outgoing radiance L_back = E * (T_dir + T_scat) * backScale.
 */
export function computeBackLightRadiance(params: BackLightPixelParams): RgbLinear {
  const backScale = Math.max(0, params.backScale ?? 1);
  if (backScale <= 0) {
    return { r: 0, g: 0, b: 0 };
  }
  const T = computeBeerLambertTransmission(params);
  const E = computeBackLightIrradiance(params.worldPosCm, params.back, params.canvasSizeCm);
  return {
    r: E.r * T.total.r * backScale,
    g: E.g * T.total.g * backScale,
    b: E.b * T.total.b * backScale,
  };
}
