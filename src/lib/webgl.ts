import { MAX_PROJECT_PX } from '@/core/constants';

export function detectWebGL2Support(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export function getMaxTextureSize(): number {
  if (typeof document === 'undefined') return MAX_PROJECT_PX;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return MAX_PROJECT_PX;
    const size = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return typeof size === 'number' && size > 0 ? Math.min(size, MAX_PROJECT_PX) : MAX_PROJECT_PX;
  } catch {
    return MAX_PROJECT_PX;
  }
}
