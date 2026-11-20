export function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

export function floatToUint8(v: number): number {
  return Math.round(clamp01(v) * 255);
}

export function uint8ToFloat(u: number): number {
  return Math.max(0, Math.min(255, u)) / 255;
}

export function floatToUint16(v: number): number {
  return Math.round(clamp01(v) * 65535);
}

export function uint16ToFloat(u: number): number {
  return Math.max(0, Math.min(65535, u)) / 65535;
}
