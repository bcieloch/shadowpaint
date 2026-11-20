import * as THREE from 'three';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import { clampRect, isEmptyRect } from '@/core/maps/rect';
import type { MapId, Rect } from '@/core/types';
import { float32ToHalfFloatArray, updateHalfFloatRectInPlace } from '@/imaging/halfFloat';

function alignRectTo4(rect: Rect, width: number, height: number): Rect {
  const x0 = Math.floor(rect.x / 4) * 4;
  const y0 = Math.floor(rect.y / 4) * 4;
  const x1 = Math.ceil((rect.x + rect.w) / 4) * 4;
  const y1 = Math.ceil((rect.y + rect.h) / 4) * 4;
  return clampRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, width, height);
}

export class MapTextures {
  readonly width: number;
  readonly height: number;
  readonly colorTex: THREE.DataTexture;
  readonly heightTex: THREE.DataTexture;
  readonly opacityTex: THREE.DataTexture;
  readonly maskTex: THREE.DataTexture;

  private readonly colorData: Uint8ClampedArray;
  private readonly heightHalfData: Uint16Array;
  private readonly opacityHalfData: Uint16Array;
  private readonly maskData: Uint8Array;

  // Persistent CPU staging textures wrapping our full-size mirrors (never set needsUpdate=true)
  // so copyTextureToTexture sub-rect uploads perform zero heap allocations per dab.
  private readonly colorStagingTex: THREE.DataTexture;
  private readonly heightStagingTex: THREE.DataTexture;
  private readonly opacityStagingTex: THREE.DataTexture;
  private readonly maskStagingTex: THREE.DataTexture;
  private readonly srcRegion = new THREE.Box2();
  private readonly dstPosition = new THREE.Vector2();

  private readonly gpuInitialized: Record<MapId, boolean> = {
    color: false,
    height: false,
    opacity: false,
  };
  private maskGpuInitialized = false;
  private nearestEnabled = false;
  private disposed = false;

  constructor(registry: MapRegistry, renderer: THREE.WebGLRenderer) {
    if (!registry.isAllocated) {
      throw new Error('Cannot create MapTextures before MapRegistry is allocated');
    }

    const width = registry.width;
    const height = registry.height;
    const maxSize = renderer.capabilities.maxTextureSize;
    if (width > maxSize || height > maxSize) {
      throw new Error(
        `Project resolution ${width}x${height} exceeds GPU maxTextureSize (${maxSize})`,
      );
    }

    this.width = width;
    this.height = height;

    this.colorData = new Uint8ClampedArray(registry.color.effective);
    this.heightHalfData = float32ToHalfFloatArray(registry.heightMap.effective);
    this.opacityHalfData = float32ToHalfFloatArray(registry.opacity.effective);
    this.maskData = new Uint8Array(registry.selection);

    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    this.colorTex = new THREE.DataTexture(
      this.colorData,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.colorTex.colorSpace = THREE.SRGBColorSpace;
    this.colorTex.flipY = false;
    this.colorTex.wrapS = THREE.ClampToEdgeWrapping;
    this.colorTex.wrapT = THREE.ClampToEdgeWrapping;
    this.colorTex.generateMipmaps = true;
    this.colorTex.mipmapsAutoUpdate = true;
    this.colorTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.colorTex.magFilter = THREE.LinearFilter;
    this.colorTex.anisotropy = anisotropy;
    this.colorTex.unpackAlignment = 4;
    this.colorTex.needsUpdate = true;

    this.colorStagingTex = new THREE.DataTexture(
      this.colorData,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.colorStagingTex.colorSpace = THREE.SRGBColorSpace;
    this.colorStagingTex.flipY = false;
    this.colorStagingTex.unpackAlignment = 4;

    this.heightTex = new THREE.DataTexture(
      this.heightHalfData,
      width,
      height,
      THREE.RedFormat,
      THREE.HalfFloatType,
    );
    this.heightTex.colorSpace = THREE.NoColorSpace;
    this.heightTex.flipY = false;
    this.heightTex.wrapS = THREE.ClampToEdgeWrapping;
    this.heightTex.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTex.generateMipmaps = false;
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.unpackAlignment = 2;
    this.heightTex.needsUpdate = true;

    this.heightStagingTex = new THREE.DataTexture(
      this.heightHalfData,
      width,
      height,
      THREE.RedFormat,
      THREE.HalfFloatType,
    );
    this.heightStagingTex.colorSpace = THREE.NoColorSpace;
    this.heightStagingTex.flipY = false;
    this.heightStagingTex.unpackAlignment = 2;

    this.opacityTex = new THREE.DataTexture(
      this.opacityHalfData,
      width,
      height,
      THREE.RedFormat,
      THREE.HalfFloatType,
    );
    this.opacityTex.colorSpace = THREE.NoColorSpace;
    this.opacityTex.flipY = false;
    this.opacityTex.wrapS = THREE.ClampToEdgeWrapping;
    this.opacityTex.wrapT = THREE.ClampToEdgeWrapping;
    this.opacityTex.generateMipmaps = false;
    this.opacityTex.minFilter = THREE.LinearFilter;
    this.opacityTex.magFilter = THREE.LinearFilter;
    this.opacityTex.unpackAlignment = 2;
    this.opacityTex.needsUpdate = true;

    this.opacityStagingTex = new THREE.DataTexture(
      this.opacityHalfData,
      width,
      height,
      THREE.RedFormat,
      THREE.HalfFloatType,
    );
    this.opacityStagingTex.colorSpace = THREE.NoColorSpace;
    this.opacityStagingTex.flipY = false;
    this.opacityStagingTex.unpackAlignment = 2;

    this.maskTex = new THREE.DataTexture(
      this.maskData,
      width,
      height,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.maskTex.colorSpace = THREE.NoColorSpace;
    this.maskTex.flipY = false;
    this.maskTex.wrapS = THREE.ClampToEdgeWrapping;
    this.maskTex.wrapT = THREE.ClampToEdgeWrapping;
    this.maskTex.generateMipmaps = false;
    this.maskTex.minFilter = THREE.LinearFilter;
    this.maskTex.magFilter = THREE.LinearFilter;
    this.maskTex.unpackAlignment = 1;
    this.maskTex.needsUpdate = true;

    this.maskStagingTex = new THREE.DataTexture(
      this.maskData,
      width,
      height,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.maskStagingTex.colorSpace = THREE.NoColorSpace;
    this.maskStagingTex.flipY = false;
    this.maskStagingTex.unpackAlignment = 1;
  }

  getTexture(mapId: MapId): THREE.DataTexture {
    if (mapId === 'color') return this.colorTex;
    if (mapId === 'height') return this.heightTex;
    return this.opacityTex;
  }

  markGpuInitialized(): void {
    this.gpuInitialized.color = true;
    this.gpuInitialized.height = true;
    this.gpuInitialized.opacity = true;
    this.maskGpuInitialized = true;
  }

  uploadFull(registry: MapRegistry, mapId: MapId): void {
    if (this.disposed) return;
    if (mapId === 'color') {
      this.colorData.set(registry.color.effective);
      this.colorTex.needsUpdate = true;
      return;
    }
    if (mapId === 'height') {
      float32ToHalfFloatArray(registry.heightMap.effective, this.heightHalfData);
      this.heightTex.needsUpdate = true;
      return;
    }
    float32ToHalfFloatArray(registry.opacity.effective, this.opacityHalfData);
    this.opacityTex.needsUpdate = true;
  }

  uploadMaskFull(registry: MapRegistry): void {
    if (this.disposed) return;
    this.maskData.set(registry.selection);
    this.maskTex.needsUpdate = true;
  }

  uploadMaskDirtyRect(renderer: THREE.WebGLRenderer, registry: MapRegistry, rawRect: Rect): void {
    if (this.disposed) return;
    const aligned = alignRectTo4(rawRect, this.width, this.height);
    if (isEmptyRect(aligned)) return;

    const totalArea = this.width * this.height;
    const dirtyArea = aligned.w * aligned.h;

    if (!this.maskGpuInitialized || dirtyArea >= totalArea * 0.6) {
      this.uploadMaskFull(registry);
      return;
    }

    const src = registry.selection;
    const yEnd = aligned.y + aligned.h;
    for (let y = aligned.y; y < yEnd; y++) {
      const rowStart = y * this.width + aligned.x;
      this.maskData.set(src.subarray(rowStart, rowStart + aligned.w), rowStart);
    }

    this.srcRegion.min.set(aligned.x, aligned.y);
    this.srcRegion.max.set(aligned.x + aligned.w, aligned.y + aligned.h);
    this.dstPosition.set(aligned.x, aligned.y);
    renderer.copyTextureToTexture(
      this.maskStagingTex,
      this.maskTex,
      this.srcRegion,
      this.dstPosition,
    );
  }

  uploadAll(registry: MapRegistry): void {
    this.uploadFull(registry, 'color');
    this.uploadFull(registry, 'height');
    this.uploadFull(registry, 'opacity');
    this.uploadMaskFull(registry);
  }

  uploadDirtyRect(
    renderer: THREE.WebGLRenderer,
    registry: MapRegistry,
    mapId: MapId,
    rawRect: Rect,
  ): void {
    if (this.disposed) return;

    const aligned = alignRectTo4(rawRect, this.width, this.height);
    if (isEmptyRect(aligned)) return;

    const totalArea = this.width * this.height;
    const dirtyArea = aligned.w * aligned.h;

    if (!this.gpuInitialized[mapId] || dirtyArea >= totalArea * 0.6) {
      this.uploadFull(registry, mapId);
      return;
    }

    this.srcRegion.min.set(aligned.x, aligned.y);
    this.srcRegion.max.set(aligned.x + aligned.w, aligned.y + aligned.h);
    this.dstPosition.set(aligned.x, aligned.y);

    if (mapId === 'color') {
      const src = registry.color.effective;
      const rowBytes = aligned.w * 4;
      const yEnd = aligned.y + aligned.h;
      for (let y = aligned.y; y < yEnd; y++) {
        const start = (y * this.width + aligned.x) * 4;
        this.colorData.set(src.subarray(start, start + rowBytes), start);
      }
      renderer.copyTextureToTexture(
        this.colorStagingTex,
        this.colorTex,
        this.srcRegion,
        this.dstPosition,
      );
      return;
    }

    if (mapId === 'height') {
      updateHalfFloatRectInPlace(
        registry.heightMap.effective,
        this.width,
        aligned,
        this.heightHalfData,
      );
      renderer.copyTextureToTexture(
        this.heightStagingTex,
        this.heightTex,
        this.srcRegion,
        this.dstPosition,
      );
      return;
    }

    updateHalfFloatRectInPlace(
      registry.opacity.effective,
      this.width,
      aligned,
      this.opacityHalfData,
    );
    renderer.copyTextureToTexture(
      this.opacityStagingTex,
      this.opacityTex,
      this.srcRegion,
      this.dstPosition,
    );
  }

  setNearest(nearest: boolean, renderer: THREE.WebGLRenderer): void {
    if (this.disposed || this.nearestEnabled === nearest) return;
    this.nearestEnabled = nearest;
    const filter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    this.colorTex.magFilter = filter;
    this.heightTex.magFilter = filter;
    this.opacityTex.magFilter = filter;
    this.maskTex.magFilter = filter;

    // Update GL texture parameters in-place without re-uploading megabytes of pixels.
    const gl = renderer.getContext();
    const glFilter = nearest ? gl.NEAREST : gl.LINEAR;
    const prevActive = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    gl.activeTexture(gl.TEXTURE0);
    const prevBound = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;

    for (const tex of [this.colorTex, this.heightTex, this.opacityTex, this.maskTex]) {
      const props = renderer.properties.get(tex) as { __webglTexture?: WebGLTexture } | undefined;
      if (props?.__webglTexture) {
        gl.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, prevBound);
    gl.activeTexture(prevActive);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.colorTex.dispose();
    this.heightTex.dispose();
    this.opacityTex.dispose();
    this.maskTex.dispose();
    this.colorStagingTex.dispose();
    this.heightStagingTex.dispose();
    this.opacityStagingTex.dispose();
    this.maskStagingTex.dispose();
  }
}
