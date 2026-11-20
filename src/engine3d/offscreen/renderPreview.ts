import * as THREE from 'three';
import type {
  CanvasSettings,
  LightingMode,
  LightingSettings,
  MaterialSettings,
  View3DSettings,
} from '@/core/types';
import type { PaintingScene } from '@/engine3d/scene/PaintingScene';
import type { MapTextures } from '@/engine3d/textures/MapTextures';

export interface RenderedPreviewImage {
  mode: LightingMode;
  width: number;
  height: number;
  rgb: Uint8Array;
}

export function computePreviewDimensions(
  widthCm: number,
  heightCm: number,
  longestSide: number,
  maxRenderbufferSize = 4096,
): { width: number; height: number } {
  const safeMax = Math.max(64, Math.min(4096, Math.floor(maxRenderbufferSize || 4096)));
  const targetLongest = Math.max(64, Math.min(safeMax, Math.round(longestSide)));
  const safeW = Math.max(0.01, widthCm);
  const safeH = Math.max(0.01, heightCm);

  if (safeW >= safeH) {
    return {
      width: targetLongest,
      height: Math.max(1, Math.round(targetLongest * (safeH / safeW))),
    };
  }
  return {
    width: Math.max(1, Math.round(targetLongest * (safeW / safeH))),
    height: targetLongest,
  };
}

export interface RenderOffscreenPreviewParams {
  renderer: THREE.WebGLRenderer;
  paintingScene: PaintingScene;
  mapTextures: MapTextures;
  canvas: CanvasSettings;
  material: MaterialSettings;
  lighting: LightingSettings;
  view3d: View3DSettings;
  maxTextureSize: number;
  mode: LightingMode;
  longestSide: number;
  forceShadowUpdate?: boolean;
}

export function renderOffscreenPreview(params: RenderOffscreenPreviewParams): RenderedPreviewImage {
  const {
    renderer,
    paintingScene,
    mapTextures,
    canvas,
    material,
    lighting,
    view3d,
    maxTextureSize,
    mode,
    longestSide,
    forceShadowUpdate = false,
  } = params;

  const gl = renderer.getContext();
  const glMaxRb = gl ? Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) : 0;
  const maxRb = glMaxRb > 0 ? glMaxRb : maxTextureSize || 4096;
  const { width, height } = computePreviewDimensions(
    canvas.widthCm,
    canvas.heightCm,
    longestSide,
    maxRb,
  );

  const halfW = canvas.widthCm / 2;
  const halfH = canvas.heightCm / 2;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000);
  camera.position.set(0, 0, 500);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const rt = new THREE.WebGLRenderTarget(width, height, {
    colorSpace: THREE.SRGBColorSpace,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });

  const prevTarget = renderer.getRenderTarget();
  const prevToneMapping = renderer.toneMapping;
  const prevExposure = renderer.toneMappingExposure;

  try {
    mapTextures.setNearest(false, renderer);

    const { shadowConfigChanged, frontScale } = paintingScene.update(
      mapTextures,
      canvas,
      material,
      lighting,
      view3d,
      maxTextureSize,
      false,
      mode,
    );

    if (
      (forceShadowUpdate || shadowConfigChanged) &&
      frontScale > 0 &&
      lighting.front.castShadows
    ) {
      renderer.shadowMap.needsUpdate = true;
    }

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lighting.exposure;
    renderer.setRenderTarget(rt);
    renderer.render(paintingScene.scene, camera);

    const raw = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, width, height, raw);

    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
      const srcRowOffset = (height - 1 - y) * width * 4;
      const dstRowOffset = y * width * 3;
      for (let x = 0; x < width; x++) {
        const s = srcRowOffset + x * 4;
        const d = dstRowOffset + x * 3;
        rgb[d] = raw[s] ?? 0;
        rgb[d + 1] = raw[s + 1] ?? 0;
        rgb[d + 2] = raw[s + 2] ?? 0;
      }
    }

    return {
      mode,
      width,
      height,
      rgb,
    };
  } finally {
    renderer.toneMapping = prevToneMapping;
    renderer.toneMappingExposure = prevExposure;
    renderer.setRenderTarget(prevTarget);
    rt.dispose();
  }
}
