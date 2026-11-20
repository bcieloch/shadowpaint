import * as THREE from 'three';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import { unionRect } from '@/core/maps/rect';
import type { CanvasSettings, MapId, Rect } from '@/core/types';
import { type ViewportSize, type ViewTransformState } from '@/editor2d/viewTransform';
import { Ortho2D } from '@/engine3d/cameras/Ortho2D';
import {
  disposeObject3D,
  getRendererMemoryInfo,
  type RendererMemoryInfo,
} from '@/engine3d/dispose';
import {
  createCanvasQuadGeometry,
  createFlatViewMaterial,
  resolveFlatViewShaderMode,
} from '@/engine3d/materials/flatViewMaterial';
import { MapTextures } from '@/engine3d/textures/MapTextures';

export type FlatRenderMode = 'color' | 'height' | 'opacity';
export type HeightRenderDisplay = 'gray' | 'heat' | 'topo';

export interface EngineRenderParams {
  canvas: CanvasSettings;
  viewMode2D: FlatRenderMode;
  heightDisplay: HeightRenderDisplay;
  contourStepMm: number;
  pane2D: ViewTransformState;
}

export interface EngineCallbacks {
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onError?: (error: Error) => void;
}

export class Engine {
  private readonly canvasElement: HTMLCanvasElement;
  private readonly registry: MapRegistry;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly flatScene: THREE.Scene;
  private readonly ortho2D: Ortho2D;
  private readonly callbacks: EngineCallbacks;

  private mapTextures: MapTextures | null = null;
  private flatMaterial: THREE.ShaderMaterial | null = null;
  private flatMesh: THREE.Mesh | null = null;
  private builtWidthPx = 0;
  private builtHeightPx = 0;
  private builtWidthCm = 0;
  private builtHeightCm = 0;

  private viewport: ViewportSize = { width: 1, height: 1 };
  private params: EngineRenderParams | null = null;

  private needsRebuild = false;
  private pendingFull: Record<MapId, boolean> = {
    color: false,
    height: false,
    opacity: false,
  };
  private pendingDirty: Record<MapId, Rect | null> = {
    color: null,
    height: null,
    opacity: null,
  };

  private rafId: number | null = null;
  private contextLost = false;
  private disposed = false;

  private readonly unsubDirty: () => void;
  private readonly unsubReplaced: () => void;

  private readonly handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.callbacks.onContextLost?.();
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.needsRebuild = true;
    this.invalidate();
    this.callbacks.onContextRestored?.();
  };

  constructor(
    canvasElement: HTMLCanvasElement,
    registry: MapRegistry,
    callbacks: EngineCallbacks = {},
  ) {
    this.canvasElement = canvasElement;
    this.registry = registry;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x121214, 1);

    this.flatScene = new THREE.Scene();
    this.ortho2D = new Ortho2D();

    canvasElement.addEventListener('webglcontextlost', this.handleContextLost);
    canvasElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.unsubDirty = this.registry.events.on('dirty', ({ mapId, rect }) => {
      if (this.pendingFull[mapId] || this.needsRebuild) return;
      const prev = this.pendingDirty[mapId];
      this.pendingDirty[mapId] = prev ? unionRect(prev, rect) : { ...rect };
      this.invalidate();
    });

    this.unsubReplaced = this.registry.events.on('replaced', ({ mapId }) => {
      if (mapId === 'all') {
        this.needsRebuild = true;
        this.pendingFull = { color: false, height: false, opacity: false };
        this.pendingDirty = { color: null, height: null, opacity: null };
      } else {
        this.pendingFull[mapId] = true;
        this.pendingDirty[mapId] = null;
      }
      this.invalidate();
    });

    if (this.registry.isAllocated) {
      this.needsRebuild = true;
    }
  }

  setRenderParams(params: EngineRenderParams): void {
    const prev = this.params;
    this.params = params;
    if (
      prev &&
      (prev.canvas.widthPx !== params.canvas.widthPx ||
        prev.canvas.heightPx !== params.canvas.heightPx ||
        prev.canvas.widthCm !== params.canvas.widthCm ||
        prev.canvas.heightCm !== params.canvas.heightCm)
    ) {
      this.needsRebuild = true;
    }
    this.invalidate();
  }

  resize(cssWidth: number, cssHeight: number): void {
    if (this.disposed) return;
    const w = Math.max(1, cssWidth);
    const h = Math.max(1, cssHeight);
    if (this.viewport.width === w && this.viewport.height === h) return;
    this.viewport = { width: w, height: h };
    this.renderer.setSize(w, h, false);
    this.invalidate();
  }

  invalidate(): void {
    if (this.disposed || this.contextLost) return;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.renderNow();
      });
    }
  }

  renderNow(): void {
    if (this.disposed || this.contextLost || !this.params || !this.registry.isAllocated) {
      return;
    }

    try {
      this.flushPendingResources();
      if (!this.mapTextures || !this.flatMaterial || !this.flatMesh) {
        return;
      }

      const { canvas, viewMode2D, heightDisplay, contourStepMm, pane2D } = this.params;
      const uniforms = this.flatMaterial.uniforms;
      if (uniforms.uMode) {
        uniforms.uMode.value = resolveFlatViewShaderMode(viewMode2D, heightDisplay);
      }
      if (uniforms.uMinMm) uniforms.uMinMm.value = canvas.minThicknessMm;
      if (uniforms.uMaxMm) uniforms.uMaxMm.value = canvas.maxThicknessMm;
      if (uniforms.uContourStepMm) uniforms.uContourStepMm.value = contourStepMm;

      this.mapTextures.setNearest(pane2D.zoom >= 4, this.renderer);
      this.ortho2D.update(this.viewport, canvas, pane2D);

      this.renderer.setRenderTarget(null);
      this.renderer.render(this.flatScene, this.ortho2D.camera);
      this.mapTextures.markGpuInitialized();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
    }
  }

  rebuildProject(): void {
    if (this.disposed || !this.registry.isAllocated || !this.params) return;

    this.disposeSceneResources();

    const { canvas } = this.params;
    const textures = new MapTextures(this.registry, this.renderer);
    const material = createFlatViewMaterial(textures);
    const geometry = createCanvasQuadGeometry(canvas.widthCm, canvas.heightCm);
    const mesh = new THREE.Mesh(geometry, material);

    this.mapTextures = textures;
    this.flatMaterial = material;
    this.flatMesh = mesh;
    this.flatScene.add(mesh);

    this.builtWidthPx = this.registry.width;
    this.builtHeightPx = this.registry.height;
    this.builtWidthCm = canvas.widthCm;
    this.builtHeightCm = canvas.heightCm;
    this.needsRebuild = false;
    this.pendingFull = { color: false, height: false, opacity: false };
    this.pendingDirty = { color: null, height: null, opacity: null };
  }

  /**
   * Renders the full canvas orthogonally into a temporary sRGB render target and
   * returns top-down RGBA8 bytes. Used for verification and diagnostics.
   */
  readFlatCanvasRgba(targetWidth?: number, targetHeight?: number): Uint8Array {
    if (this.disposed || !this.registry.isAllocated || !this.params) {
      return new Uint8Array(0);
    }
    this.flushPendingResources();
    if (!this.mapTextures || !this.flatMaterial || !this.flatMesh) {
      return new Uint8Array(0);
    }

    const w = Math.max(1, targetWidth ?? this.registry.width);
    const h = Math.max(1, targetHeight ?? this.registry.height);
    const { canvas, viewMode2D, heightDisplay, contourStepMm } = this.params;

    const uniforms = this.flatMaterial.uniforms;
    if (uniforms.uMode) {
      uniforms.uMode.value = resolveFlatViewShaderMode(viewMode2D, heightDisplay);
    }
    if (uniforms.uMinMm) uniforms.uMinMm.value = canvas.minThicknessMm;
    if (uniforms.uMaxMm) uniforms.uMaxMm.value = canvas.maxThicknessMm;
    if (uniforms.uContourStepMm) uniforms.uContourStepMm.value = contourStepMm;

    const halfW = canvas.widthCm / 2;
    const halfH = canvas.heightCm / 2;
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 200);
    cam.position.set(0, 0, 100);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    const rt = new THREE.WebGLRenderTarget(w, h, {
      colorSpace: THREE.SRGBColorSpace,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    const prevTarget = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(rt);
      this.renderer.render(this.flatScene, cam);

      const raw = new Uint8Array(w * h * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, raw);

      // Flip rows vertically so row 0 corresponds to image top
      const flipped = new Uint8Array(w * h * 4);
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        const srcRow = (h - 1 - y) * rowBytes;
        flipped.set(raw.subarray(srcRow, srcRow + rowBytes), y * rowBytes);
      }
      return flipped;
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      rt.dispose();
    }
  }

  getMemoryInfo(): RendererMemoryInfo {
    return getRendererMemoryInfo(this.renderer);
  }

  getBuiltDimensions(): {
    widthPx: number;
    heightPx: number;
    widthCm: number;
    heightCm: number;
  } {
    return {
      widthPx: this.builtWidthPx,
      heightPx: this.builtHeightPx,
      widthCm: this.builtWidthCm,
      heightCm: this.builtHeightCm,
    };
  }

  getMaxTextureSize(): number {
    return this.renderer.capabilities.maxTextureSize;
  }

  private flushPendingResources(): void {
    if (!this.params || !this.registry.isAllocated) return;
    const { canvas } = this.params;

    const dimensionsChanged =
      this.builtWidthPx !== this.registry.width ||
      this.builtHeightPx !== this.registry.height ||
      this.builtWidthCm !== canvas.widthCm ||
      this.builtHeightCm !== canvas.heightCm;

    if (this.needsRebuild || !this.mapTextures || dimensionsChanged) {
      this.rebuildProject();
      return;
    }

    for (const mapId of ['color', 'height', 'opacity'] as const) {
      if (this.pendingFull[mapId]) {
        this.mapTextures.uploadFull(this.registry, mapId);
        this.pendingFull[mapId] = false;
        this.pendingDirty[mapId] = null;
      } else {
        const dirty = this.pendingDirty[mapId];
        if (dirty) {
          this.mapTextures.uploadDirtyRect(this.renderer, this.registry, mapId, dirty);
          this.pendingDirty[mapId] = null;
        }
      }
    }
  }

  private disposeSceneResources(): void {
    if (this.flatMesh) {
      this.flatScene.remove(this.flatMesh);
      disposeObject3D(this.flatMesh, { disposeTextures: false });
      this.flatMesh = null;
      this.flatMaterial = null;
    }
    if (this.mapTextures) {
      this.mapTextures.dispose();
      this.mapTextures = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unsubDirty();
    this.unsubReplaced();
    this.canvasElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvasElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.disposeSceneResources();
    this.renderer.dispose();
  }
}
