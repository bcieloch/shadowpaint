import * as THREE from 'three';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import { clampRect, isEmptyRect } from '@/core/maps/rect';
import type { MapId, Rect } from '@/core/types';
import {
  extractRectRgba8,
  extractRectToHalfFloat,
  float32ToHalfFloatArray,
} from '@/imaging/halfFloat';

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

  private readonly colorData: Uint8ClampedArray;
  private readonly heightHalfData: Uint16Array;
  private readonly opacityHalfData: Uint16Array;
  private readonly dstPosition = new THREE.Vector2();
  private readonly gpuInitialized: Record<MapId, boolean> = {
    color: false,
    height: false,
    opacity: false,
  };
  private nearestEnabled = false;
  private disposed = false;

  constructor(
    registry: MapRegistry,
    renderer: THREE.WebGLRenderer,
  ) {
    if (!registry.isAllocated) {
      throw new Error('Cannot create MapTextures before MapRegistry is allocated');
    }

    const width = registry.width;
    const height = registry.height;
    const maxSize = renderer.capabilities.maxTextureSize;
    if (width > maxSize || height > maxSize) {
      throw new Error(`Project resolution ${width}x${height} exceeds GPU maxTextureSize (${maxSize})`);
    }

    this.width = width;
    this.height = height;

    this.colorData = new Uint8ClampedArray(registry.color.effective);
    this.heightHalfData = float32ToHalfFloatArray(registry.heightMap.effective);
    this.opacityHalfData = float32ToHalfFloatArray(registry.opacity.effective);

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

  uploadAll(registry: MapRegistry): void {
    this.uploadFull(registry, 'color');
    this.uploadFull(registry, 'height');
    this.uploadFull(registry, 'opacity');
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

    this.dstPosition.set(aligned.x, aligned.y);

    if (mapId === 'color') {
      const subData = extractRectRgba8(registry.color.effective, this.width, aligned);
      // Keep CPU mirror in sync
      const rowBytes = aligned.w * 4;
      for (let y = 0; y < aligned.h; y++) {
        const dstStart = ((aligned.y + y) * this.width + aligned.x) * 4;
        const srcStart = y * rowBytes;
        this.colorData.set(subData.subarray(srcStart, srcStart + rowBytes), dstStart);
      }
      const srcTex = new THREE.DataTexture(
        subData,
        aligned.w,
        aligned.h,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      srcTex.colorSpace = THREE.SRGBColorSpace;
      srcTex.flipY = false;
      srcTex.unpackAlignment = 4;
      renderer.copyTextureToTexture(srcTex, this.colorTex, null, this.dstPosition);
      return;
    }

    const srcFloat = mapId === 'height' ? registry.heightMap.effective : registry.opacity.effective;
    const cpuHalf = mapId === 'height' ? this.heightHalfData : this.opacityHalfData;
    const dstTex = mapId === 'height' ? this.heightTex : this.opacityTex;

    const subHalf = extractRectToHalfFloat(srcFloat, this.width, aligned);
    for (let y = 0; y < aligned.h; y++) {
      const dstStart = (aligned.y + y) * this.width + aligned.x;
      const srcStart = y * aligned.w;
      cpuHalf.set(subHalf.subarray(srcStart, srcStart + aligned.w), dstStart);
    }
    const srcTex = new THREE.DataTexture(
      subHalf,
      aligned.w,
      aligned.h,
      THREE.RedFormat,
      THREE.HalfFloatType,
    );
    srcTex.colorSpace = THREE.NoColorSpace;
    srcTex.flipY = false;
    srcTex.unpackAlignment = 2;
    renderer.copyTextureToTexture(srcTex, dstTex, null, this.dstPosition);
  }

  setNearest(nearest: boolean, renderer: THREE.WebGLRenderer): void {
    if (this.disposed || this.nearestEnabled === nearest) return;
    this.nearestEnabled = nearest;
    const filter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    this.colorTex.magFilter = filter;
    this.heightTex.magFilter = filter;
    this.opacityTex.magFilter = filter;

    // Update GL texture parameters in-place without re-uploading megabytes of pixels.
    const gl = renderer.getContext();
    const glFilter = nearest ? gl.NEAREST : gl.LINEAR;
    const prevActive = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    gl.activeTexture(gl.TEXTURE0);
    const prevBound = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;

    for (const tex of [this.colorTex, this.heightTex, this.opacityTex]) {
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
  }
}
