import { MAX_PROJECT_PX } from '@/core/constants';

export interface GpuCapabilities {
  webgl2: boolean;
  maxTextureSize: number;
  maxVertexTextureImageUnits: number;
  maxFragmentTextureImageUnits: number;
  maxCombinedTextureImageUnits: number;
  maxAnisotropy: number;
  renderer: string;
  vendor: string;
  isSoftwareRenderer: boolean;
}

const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|mesa offscreen|angle.*basic render|microsoft basic render/i;

let cachedCapabilities: GpuCapabilities | null = null;

export function resetGpuCapabilitiesCacheForTests(): void {
  cachedCapabilities = null;
}

export function probeGpuCapabilities(): GpuCapabilities {
  if (cachedCapabilities) {
    return { ...cachedCapabilities };
  }

  const fallback: GpuCapabilities = {
    webgl2: false,
    maxTextureSize: 4096,
    maxVertexTextureImageUnits: 0,
    maxFragmentTextureImageUnits: 0,
    maxCombinedTextureImageUnits: 0,
    maxAnisotropy: 1,
    renderer: 'unavailable',
    vendor: 'unavailable',
    isSoftwareRenderer: true,
  };

  if (typeof document === 'undefined') {
    return fallback;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      cachedCapabilities = fallback;
      return { ...fallback };
    }

    const maxTextureRaw = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxVtxRaw = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
    const maxFragRaw = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    const maxCombRaw = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);

    let maxAnisotropy = 1;
    const anisoExt =
      gl.getExtension('EXT_texture_filter_anisotropic') ??
      gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ??
      gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (anisoExt) {
      const val = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      if (typeof val === 'number' && val >= 1) {
        maxAnisotropy = Math.round(val);
      }
    }

    let rendererName = String(gl.getParameter(gl.RENDERER) ?? 'unknown');
    let vendorName = String(gl.getParameter(gl.VENDOR) ?? 'unknown');
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      const unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      if (typeof unmaskedRenderer === 'string' && unmaskedRenderer.length > 0) {
        rendererName = unmaskedRenderer;
      }
      if (typeof unmaskedVendor === 'string' && unmaskedVendor.length > 0) {
        vendorName = unmaskedVendor;
      }
    }

    // Lose/release the probe context immediately so no WebGL context slots leak.
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    const caps: GpuCapabilities = {
      webgl2: true,
      maxTextureSize: typeof maxTextureRaw === 'number' && maxTextureRaw > 0 ? maxTextureRaw : 4096,
      maxVertexTextureImageUnits: typeof maxVtxRaw === 'number' ? maxVtxRaw : 0,
      maxFragmentTextureImageUnits: typeof maxFragRaw === 'number' ? maxFragRaw : 0,
      maxCombinedTextureImageUnits: typeof maxCombRaw === 'number' ? maxCombRaw : 0,
      maxAnisotropy,
      renderer: rendererName,
      vendor: vendorName,
      isSoftwareRenderer: SOFTWARE_RENDERER_PATTERN.test(rendererName),
    };

    cachedCapabilities = caps;
    return { ...caps };
  } catch {
    cachedCapabilities = fallback;
    return { ...fallback };
  }
}

export function detectWebGL2Support(): boolean {
  return probeGpuCapabilities().webgl2;
}

export function getMaxTextureSize(): number {
  const caps = probeGpuCapabilities();
  if (!caps.webgl2) return MAX_PROJECT_PX;
  return Math.min(caps.maxTextureSize, MAX_PROJECT_PX);
}
