import { clamp01 } from '@/core/maps/quantize';
import type { ColorSpec } from '@/core/types';

export interface Rgb01 {
  r: number;
  g: number;
  b: number;
}

/**
 * Converts color temperature in Kelvin (1500..12000) to sRGB [0..1]
 * using Tanner Helland's approximation, normalized at ~6500K.
 */
export function kelvinToRgb01(kelvin: number): Rgb01 {
  const k = Math.max(1000, Math.min(40000, kelvin)) / 100;

  let r: number;
  if (k <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
  }

  let g: number;
  if (k <= 66) {
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  }

  let b: number;
  if (k >= 66) {
    b = 255;
  } else if (k <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  }

  return {
    r: clamp01(r / 255),
    g: clamp01(g / 255),
    b: clamp01(b / 255),
  };
}

export function rgb01ToHex(rgb: Rgb01): string {
  const toHex = (c: number) =>
    Math.round(clamp01(c) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function hexToRgb01(hex: string): Rgb01 {
  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return { r: 1, g: 1, b: 1 };
  }
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  return { r, g, b };
}

export function kelvinToHex(kelvin: number): string {
  return rgb01ToHex(kelvinToRgb01(kelvin));
}

export function srgbToLinearChannel(c: number): number {
  const v = clamp01(c);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgbChannel(c: number): number {
  const v = clamp01(c);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function colorSpecToRgb01(spec: ColorSpec): Rgb01 {
  return spec.mode === 'kelvin' ? kelvinToRgb01(spec.kelvin) : hexToRgb01(spec.rgb);
}

export function colorSpecToHex(spec: ColorSpec): string {
  return spec.mode === 'kelvin' ? kelvinToHex(spec.kelvin) : rgb01ToHex(hexToRgb01(spec.rgb));
}
