import * as THREE from 'three';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import { unionRect } from '@/core/maps/rect';
import type {
  CanvasSettings,
  GridSettings,
  LightingMode,
  LightingSettings,
  LineSegment,
  MapId,
  MaterialSettings,
  Rect,
  Vec2,
  View3DSettings,
} from '@/core/types';
import { worldXYToPx } from '@/core/units/calibration';
import { computeSplitPanes, type SplitPanes } from '@/editor2d/splitLayout';
import { type ViewportSize, type ViewTransformState } from '@/editor2d/viewTransform';
import { Orbit3D } from '@/engine3d/cameras/Orbit3D';
import { Ortho2D } from '@/engine3d/cameras/Ortho2D';
import {
  disposeObject3D,
  getRendererMemoryInfo,
  type RendererMemoryInfo,
} from '@/engine3d/dispose';
import type { BackLightStateSnapshot } from '@/engine3d/lights/BackLight';
import type { FrontLightStateSnapshot } from '@/engine3d/lights/FrontLight';
import {
  createCanvasQuadGeometry,
  createFlatViewMaterial,
  resolveFlatViewShaderMode,
} from '@/engine3d/materials/flatViewMaterial';
import {
  renderOffscreenPreview,
  type RenderedPreviewImage,
} from '@/engine3d/offscreen/renderPreview';
import type { CanvasMeshStats } from '@/engine3d/scene/CanvasMesh';
import type { CrossSection3DOverlayStats } from '@/engine3d/scene/CrossSection3DOverlay';
import type { Cursor3DMarkerStats } from '@/engine3d/scene/Cursor3DMarker';
import {
  PaintingScene,
  type CrossSectionOverlayInput,
  type Cursor3DOverlayInput,
} from '@/engine3d/scene/PaintingScene';
import { MapTextures } from '@/engine3d/textures/MapTextures';
import type { LayoutMode, ViewMode2D } from '@/state/editorStore';

export type FlatRenderMode = 'color' | 'height' | 'opacity';
export type HeightRenderDisplay = 'gray' | 'heat' | 'topo';

export interface EngineRenderParams {
  layout: LayoutMode;
  canvas: CanvasSettings;
  material: MaterialSettings;
  lighting: LightingSettings;
  view3d: View3DSettings;
  grid: GridSettings;
  viewMode2D: ViewMode2D;
  view3DLighting?: LightingMode;
  splitRatio?: number;
  heightDisplay: HeightRenderDisplay;
  contourStepMm: number;
  showLampGizmos: boolean;
  showMaskOverlay?: boolean;
  pane2D: ViewTransformState;
  crossSectionLine?: LineSegment | null;
  crossSectionHoverT?: number | null;
}

export interface EngineCallbacks {
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onError?: (error: Error) => void;
}

export interface ReadFlatCanvasOptions {
  toneMapping?: 'aces' | 'none';
}

function toFlatShaderKey(viewMode: ViewMode2D): FlatRenderMode {
  if (viewMode === 'height') return 'height';
  if (viewMode === 'opacity') return 'opacity';
  return 'color';
}

function isLit2DMode(viewMode: ViewMode2D): viewMode is LightingMode {
  return viewMode === 'front' || viewMode === 'back' || viewMode === 'combined';
}

function frontLightShadowRelevantChanged(
  a: LightingSettings['front'],
  b: LightingSettings['front'],
): boolean {
  return (
    a.xCm !== b.xCm ||
    a.heightAboveTopCm !== b.heightAboveTopCm ||
    a.distanceCm !== b.distanceCm ||
    a.targetXCm !== b.targetXCm ||
    a.targetYCm !== b.targetYCm ||
    a.coneAngleDeg !== b.coneAngleDeg ||
    a.sourceSizeCm !== b.sourceSizeCm ||
    a.castShadows !== b.castShadows ||
    a.shadowMapSize !== b.shadowMapSize
  );
}

export class Engine {
  private readonly canvasElement: HTMLCanvasElement;
  private readonly registry: MapRegistry;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly flatScene: THREE.Scene;
  private readonly ortho2D: Ortho2D;
  private readonly orbit3D: Orbit3D;
  private readonly callbacks: EngineCallbacks;
  private readonly raycaster = new THREE.Raycaster();
  private readonly rayNdc = new THREE.Vector2();
  private readonly canvasPlaneZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly rayHit = new THREE.Vector3();

  private mapTextures: MapTextures | null = null;
  private flatMaterial: THREE.ShaderMaterial | null = null;
  private flatMesh: THREE.Mesh | null = null;
  private paintingScene: PaintingScene | null = null;
  private builtWidthPx = 0;
  private builtHeightPx = 0;
  private builtWidthCm = 0;
  private builtHeightCm = 0;
  private orbitInitializedForProject = false;
  private shadowDirty = true;
  private heightVersion = 0;

  private viewport: ViewportSize = { width: 1, height: 1 };
  private params: EngineRenderParams | null = null;
  private cursorImagePos: Vec2 | null = null;
  private orbitDragging = false;

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
  private pendingMaskFull = false;
  private pendingMaskDirty: Rect | null = null;

  private rafId: number | null = null;
  private contextLost = false;
  private disposed = false;

  private readonly unsubDirty: () => void;
  private readonly unsubReplaced: () => void;
  private readonly unsubSelectionChanged: () => void;

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
    this.shadowDirty = true;
    this.invalidate();
    this.callbacks.onContextRestored?.();
  };

  private readonly handleCanvasPointerDownCapture = (e: PointerEvent): void => {
    if (this.params?.layout !== 'split') return;
    const rect = this.canvasElement.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const panes = this.getSplitPanes();
    const inRight = localX >= panes.dividerX;
    this.orbitDragging = inRight;
    this.orbit3D.setEnabled(inRight);
  };

  private readonly handleCanvasPointerMoveCapture = (e: PointerEvent): void => {
    if (this.params?.layout !== 'split' || this.orbitDragging) return;
    const rect = this.canvasElement.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const panes = this.getSplitPanes();
    this.orbit3D.setEnabled(localX >= panes.dividerX);
  };

  private readonly handleWindowPointerUpCapture = (): void => {
    this.orbitDragging = false;
  };

  private readonly handleCanvasWheelCapture = (e: WheelEvent): void => {
    if (this.params?.layout !== 'split') return;
    const rect = this.canvasElement.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const panes = this.getSplitPanes();
    this.orbit3D.setEnabled(localX >= panes.dividerX);
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x121214, 1);

    this.flatScene = new THREE.Scene();
    this.ortho2D = new Ortho2D();
    this.orbit3D = new Orbit3D(canvasElement, () => {
      this.invalidate();
    });

    canvasElement.addEventListener('webglcontextlost', this.handleContextLost);
    canvasElement.addEventListener('webglcontextrestored', this.handleContextRestored);
    canvasElement.addEventListener('pointerdown', this.handleCanvasPointerDownCapture, {
      capture: true,
    });
    canvasElement.addEventListener('pointermove', this.handleCanvasPointerMoveCapture, {
      capture: true,
    });
    canvasElement.addEventListener('wheel', this.handleCanvasWheelCapture, {
      capture: true,
      passive: true,
    });
    window.addEventListener('pointerup', this.handleWindowPointerUpCapture, { capture: true });
    window.addEventListener('pointercancel', this.handleWindowPointerUpCapture, { capture: true });

    this.unsubDirty = this.registry.events.on('dirty', ({ mapId, rect }) => {
      if (mapId === 'height') {
        this.shadowDirty = true;
        this.heightVersion++;
      }
      if (this.pendingFull[mapId] || this.needsRebuild) return;
      const prev = this.pendingDirty[mapId];
      this.pendingDirty[mapId] = prev ? unionRect(prev, rect) : { ...rect };
      this.invalidate();
    });

    this.unsubReplaced = this.registry.events.on('replaced', ({ mapId }) => {
      if (mapId === 'all' || mapId === 'height') {
        this.shadowDirty = true;
        this.heightVersion++;
      }
      if (mapId === 'all') {
        this.needsRebuild = true;
        this.pendingFull = { color: false, height: false, opacity: false };
        this.pendingDirty = { color: null, height: null, opacity: null };
        this.pendingMaskFull = false;
        this.pendingMaskDirty = null;
      } else {
        this.pendingFull[mapId] = true;
        this.pendingDirty[mapId] = null;
      }
      this.invalidate();
    });

    this.unsubSelectionChanged = this.registry.events.on('selectionChanged', ({ rect }) => {
      if (this.needsRebuild) return;
      if (rect && !this.pendingMaskFull) {
        this.pendingMaskDirty = this.pendingMaskDirty
          ? unionRect(this.pendingMaskDirty, rect)
          : { ...rect };
      } else {
        this.pendingMaskFull = true;
        this.pendingMaskDirty = null;
      }
      this.invalidate();
    });

    if (this.registry.isAllocated) {
      this.needsRebuild = true;
    }
  }

  private getSplitPanes(): SplitPanes {
    return computeSplitPanes(
      this.viewport.width,
      this.viewport.height,
      this.params?.splitRatio ?? 0.5,
    );
  }

  private get3DViewportSize(): ViewportSize {
    if (this.params?.layout === 'split') {
      const { rightPane } = this.getSplitPanes();
      return { width: rightPane.width, height: rightPane.height };
    }
    return this.viewport;
  }

  private resolve3DLightingMode(params: EngineRenderParams): LightingMode {
    if (params.layout === 'split') {
      return params.view3DLighting ?? params.lighting.mode;
    }
    return params.lighting.mode;
  }

  private buildCrossSectionInput(visible: boolean): CrossSectionOverlayInput {
    return {
      visible,
      line: this.params?.crossSectionLine ?? null,
      hoverT: this.params?.crossSectionHoverT ?? null,
      heightEffective: this.registry.isAllocated ? this.registry.heightMap.effective : null,
      heightVersion: this.heightVersion,
    };
  }

  private buildCursor3DInput(visible: boolean): Cursor3DOverlayInput {
    return {
      visible: visible && this.cursorImagePos !== null,
      imagePos: this.cursorImagePos,
      heightEffective: this.registry.isAllocated ? this.registry.heightMap.effective : null,
    };
  }

  setCursorImagePos(pos: Vec2 | null): void {
    const next = pos ? { x: pos.x, y: pos.y } : null;
    if (
      (this.cursorImagePos === null && next === null) ||
      (this.cursorImagePos && next && this.cursorImagePos.x === next.x && this.cursorImagePos.y === next.y)
    ) {
      return;
    }
    this.cursorImagePos = next;
    if (this.params?.layout === 'split') {
      this.invalidate();
    }
  }

  setRenderParams(params: EngineRenderParams): void {
    const prev = this.params;
    this.params = params;
    if (params.layout === '3d') {
      this.orbit3D.setEnabled(true);
      this.orbitDragging = false;
    } else if (params.layout === '2d') {
      this.orbit3D.setEnabled(false);
      this.orbitDragging = false;
    } else if (prev?.layout !== 'split') {
      this.orbitDragging = false;
    }

    const vp3d = this.get3DViewportSize();
    this.orbit3D.setAspect(vp3d.width, vp3d.height);

    if (
      prev &&
      (prev.canvas.widthPx !== params.canvas.widthPx ||
        prev.canvas.heightPx !== params.canvas.heightPx)
    ) {
      this.needsRebuild = true;
      this.shadowDirty = true;
    }

    if (
      !prev ||
      prev.canvas.widthCm !== params.canvas.widthCm ||
      prev.canvas.heightCm !== params.canvas.heightCm ||
      prev.canvas.minThicknessMm !== params.canvas.minThicknessMm ||
      prev.canvas.maxThicknessMm !== params.canvas.maxThicknessMm ||
      prev.view3d.reliefMultiplier !== params.view3d.reliefMultiplier ||
      prev.view3d.meshDetail !== params.view3d.meshDetail ||
      prev.view3d.showFrame !== params.view3d.showFrame ||
      frontLightShadowRelevantChanged(prev.lighting.front, params.lighting.front)
    ) {
      this.shadowDirty = true;
    }

    if ((params.layout === '3d' || params.layout === 'split') && !this.orbitInitializedForProject) {
      this.orbit3D.resetView(params.canvas);
      this.orbitInitializedForProject = true;
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
    const vp3d = this.get3DViewportSize();
    this.orbit3D.setAspect(vp3d.width, vp3d.height);
    this.invalidate();
  }

  resetView3D(): void {
    if (this.disposed || !this.params) return;
    const vp3d = this.get3DViewportSize();
    this.orbit3D.setAspect(vp3d.width, vp3d.height);
    this.orbit3D.resetView(this.params.canvas);
    this.orbitInitializedForProject = true;
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

  private render2DPane(paneViewport: ViewportSize): void {
    if (!this.params || !this.mapTextures || !this.flatMaterial || !this.paintingScene) return;
    const {
      canvas,
      material,
      lighting,
      view3d,
      viewMode2D,
      heightDisplay,
      contourStepMm,
      showMaskOverlay = true,
      pane2D,
    } = this.params;

    if (isLit2DMode(viewMode2D)) {
      const { shadowConfigChanged, frontScale } = this.paintingScene.update(
        this.mapTextures,
        canvas,
        material,
        lighting,
        view3d,
        this.getMaxTextureSize(),
        false,
        viewMode2D,
        undefined,
        undefined,
        undefined,
      );
      if (shadowConfigChanged) {
        this.shadowDirty = true;
      }
      this.mapTextures.setNearest(pane2D.zoom >= 4, this.renderer);
      this.ortho2D.update(paneViewport, canvas, pane2D);
      if (this.shadowDirty && frontScale > 0 && lighting.front.castShadows) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowDirty = false;
      }
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = lighting.exposure;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.paintingScene.scene, this.ortho2D.camera);
      this.mapTextures.markGpuInitialized();
      return;
    }

    const uniforms = this.flatMaterial.uniforms;
    if (uniforms.uMode) {
      uniforms.uMode.value = resolveFlatViewShaderMode(
        toFlatShaderKey(viewMode2D),
        heightDisplay,
      );
    }
    if (uniforms.uMinMm) uniforms.uMinMm.value = canvas.minThicknessMm;
    if (uniforms.uMaxMm) uniforms.uMaxMm.value = canvas.maxThicknessMm;
    if (uniforms.uContourStepMm) uniforms.uContourStepMm.value = contourStepMm;
    if (uniforms.uShowMaskOverlay) {
      uniforms.uShowMaskOverlay.value = showMaskOverlay && this.registry.hasSelection ? 1 : 0;
    }

    this.mapTextures.setNearest(pane2D.zoom >= 4, this.renderer);
    this.ortho2D.update(paneViewport, canvas, pane2D);

    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.flatScene, this.ortho2D.camera);
    this.mapTextures.markGpuInitialized();
  }

  private render3DPane(mode: LightingMode, showSplitCursor: boolean): void {
    if (!this.params || !this.mapTextures || !this.paintingScene) return;
    const { canvas, material, lighting, view3d, grid, showLampGizmos } = this.params;
    const { shadowConfigChanged, frontScale } = this.paintingScene.update(
      this.mapTextures,
      canvas,
      material,
      lighting,
      view3d,
      this.getMaxTextureSize(),
      showLampGizmos,
      mode,
      grid,
      this.buildCrossSectionInput(true),
      this.buildCursor3DInput(showSplitCursor),
    );
    if (shadowConfigChanged) {
      this.shadowDirty = true;
    }
    if (this.orbit3D.controls.enabled) {
      this.orbit3D.update();
    } else {
      this.orbit3D.camera.updateMatrixWorld();
    }
    this.mapTextures.setNearest(false, this.renderer);
    if (this.shadowDirty && frontScale > 0 && lighting.front.castShadows) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = lighting.exposure;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.paintingScene.scene, this.orbit3D.camera);
    this.mapTextures.markGpuInitialized();
  }

  renderNow(): void {
    if (this.disposed || this.contextLost || !this.params || !this.registry.isAllocated) {
      return;
    }

    try {
      this.flushPendingResources();
      if (!this.mapTextures || !this.flatMaterial || !this.flatMesh || !this.paintingScene) {
        return;
      }

      const { layout } = this.params;

      if (layout === 'split') {
        const { leftPane, rightPane } = this.getSplitPanes();
        this.orbit3D.setAspect(rightPane.width, rightPane.height);
        this.renderer.setScissorTest(true);

        // Pass 1: 2D left pane
        this.renderer.setViewport(leftPane.x, 0, leftPane.width, leftPane.height);
        this.renderer.setScissor(leftPane.x, 0, leftPane.width, leftPane.height);
        this.render2DPane({ width: leftPane.width, height: leftPane.height });

        // Pass 2: 3D right pane
        this.renderer.setViewport(rightPane.x, 0, rightPane.width, rightPane.height);
        this.renderer.setScissor(rightPane.x, 0, rightPane.width, rightPane.height);
        this.render3DPane(this.resolve3DLightingMode(this.params), true);
        return;
      }

      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.viewport.width, this.viewport.height);

      if (layout === '3d') {
        this.orbit3D.setAspect(this.viewport.width, this.viewport.height);
        this.render3DPane(this.params.lighting.mode, false);
        return;
      }

      this.render2DPane(this.viewport);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
    }
  }

  rebuildProject(): void {
    if (this.disposed || !this.registry.isAllocated || !this.params) return;

    this.disposeSceneResources();

    const { canvas, material, lighting, view3d, grid, layout, viewMode2D, showLampGizmos } =
      this.params;
    const textures = new MapTextures(this.registry, this.renderer);
    const flatMat = createFlatViewMaterial(textures);
    const flatGeo = createCanvasQuadGeometry(canvas.widthCm, canvas.heightCm);
    const flatMesh = new THREE.Mesh(flatGeo, flatMat);

    const is3DVisible = layout === '3d' || layout === 'split';
    const effectiveMode = is3DVisible
      ? this.resolve3DLightingMode(this.params)
      : isLit2DMode(viewMode2D)
        ? viewMode2D
        : lighting.mode;

    const paintingScene = new PaintingScene(
      textures,
      canvas,
      material,
      lighting,
      view3d,
      this.getMaxTextureSize(),
      is3DVisible && showLampGizmos,
      effectiveMode,
      is3DVisible ? grid : undefined,
      is3DVisible ? this.buildCrossSectionInput(true) : undefined,
      layout === 'split' ? this.buildCursor3DInput(true) : undefined,
    );

    this.mapTextures = textures;
    this.flatMaterial = flatMat;
    this.flatMesh = flatMesh;
    this.flatScene.add(flatMesh);
    this.paintingScene = paintingScene;

    this.builtWidthPx = this.registry.width;
    this.builtHeightPx = this.registry.height;
    this.builtWidthCm = canvas.widthCm;
    this.builtHeightCm = canvas.heightCm;
    this.orbitInitializedForProject = false;
    this.shadowDirty = true;
    const vp3d = this.get3DViewportSize();
    this.orbit3D.setAspect(vp3d.width, vp3d.height);
    if (is3DVisible) {
      this.orbit3D.resetView(canvas);
      this.orbitInitializedForProject = true;
    }

    this.needsRebuild = false;
    this.pendingFull = { color: false, height: false, opacity: false };
    this.pendingDirty = { color: null, height: null, opacity: null };
    this.pendingMaskFull = false;
    this.pendingMaskDirty = null;
  }

  /**
   * Renders the full canvas orthogonally into a temporary sRGB render target and
   * returns top-down RGBA8 bytes. Used for verification and diagnostics.
   */
  readFlatCanvasRgba(
    targetWidth?: number,
    targetHeight?: number,
    options: ReadFlatCanvasOptions = {},
  ): Uint8Array {
    if (this.disposed || !this.registry.isAllocated || !this.params) {
      return new Uint8Array(0);
    }
    this.flushPendingResources();
    if (!this.mapTextures || !this.flatMaterial || !this.flatMesh || !this.paintingScene) {
      return new Uint8Array(0);
    }

    const w = Math.max(1, targetWidth ?? this.registry.width);
    const h = Math.max(1, targetHeight ?? this.registry.height);
    const {
      canvas,
      material,
      lighting,
      view3d,
      viewMode2D,
      heightDisplay,
      contourStepMm,
      showMaskOverlay = true,
    } = this.params;

    const halfW = canvas.widthCm / 2;
    const halfH = canvas.heightCm / 2;
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000);
    cam.position.set(0, 0, 500);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    const isLit2D = isLit2DMode(viewMode2D);
    const rt = new THREE.WebGLRenderTarget(w, h, {
      colorSpace: THREE.SRGBColorSpace,
      type: THREE.UnsignedByteType,
      minFilter: isLit2D ? THREE.LinearFilter : THREE.NearestFilter,
      magFilter: isLit2D ? THREE.LinearFilter : THREE.NearestFilter,
      depthBuffer: isLit2D,
      stencilBuffer: false,
    });

    const prevTarget = this.renderer.getRenderTarget();
    const prevToneMapping = this.renderer.toneMapping;
    const prevExposure = this.renderer.toneMappingExposure;

    try {
      if (isLit2D) {
        const { shadowConfigChanged, frontScale } = this.paintingScene.update(
          this.mapTextures,
          canvas,
          material,
          lighting,
          view3d,
          this.getMaxTextureSize(),
          false,
          viewMode2D,
          undefined,
          undefined,
          undefined,
        );
        if (shadowConfigChanged) {
          this.shadowDirty = true;
        }
        if (this.shadowDirty && frontScale > 0 && lighting.front.castShadows) {
          this.renderer.shadowMap.needsUpdate = true;
          this.shadowDirty = false;
        }
        if (options.toneMapping === 'none') {
          this.renderer.toneMapping = THREE.NoToneMapping;
          this.renderer.toneMappingExposure = 1;
        } else {
          this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
          this.renderer.toneMappingExposure = lighting.exposure;
        }
        this.renderer.setRenderTarget(rt);
        this.renderer.render(this.paintingScene.scene, cam);
      } else {
        const uniforms = this.flatMaterial.uniforms;
        if (uniforms.uMode) {
          uniforms.uMode.value = resolveFlatViewShaderMode(
            toFlatShaderKey(viewMode2D),
            heightDisplay,
          );
        }
        if (uniforms.uMinMm) uniforms.uMinMm.value = canvas.minThicknessMm;
        if (uniforms.uMaxMm) uniforms.uMaxMm.value = canvas.maxThicknessMm;
        if (uniforms.uContourStepMm) uniforms.uContourStepMm.value = contourStepMm;
        if (uniforms.uShowMaskOverlay) {
          uniforms.uShowMaskOverlay.value = showMaskOverlay && this.registry.hasSelection ? 1 : 0;
        }

        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = 1;
        this.renderer.setRenderTarget(rt);
        this.renderer.render(this.flatScene, cam);
      }

      const raw = new Uint8Array(w * h * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, raw);

      const flipped = new Uint8Array(w * h * 4);
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        const srcRow = (h - 1 - y) * rowBytes;
        flipped.set(raw.subarray(srcRow, srcRow + rowBytes), y * rowBytes);
      }
      return flipped;
    } finally {
      this.renderer.toneMapping = prevToneMapping;
      this.renderer.toneMappingExposure = prevExposure;
      this.renderer.setRenderTarget(prevTarget);
      rt.dispose();
    }
  }

  /**
   * Renders the current 3D scene from the active Orbit3D camera into an offscreen
   * render target and returns top-down RGBA8 bytes.
   */
  read3DViewportRgba(width = 256, height = 256): Uint8Array {
    if (this.disposed || !this.registry.isAllocated || !this.params) {
      return new Uint8Array(0);
    }
    this.flushPendingResources();
    if (!this.mapTextures || !this.paintingScene) {
      return new Uint8Array(0);
    }

    const { canvas, material, lighting, view3d, grid, showLampGizmos, layout } = this.params;
    const mode3D = this.resolve3DLightingMode(this.params);
    const { shadowConfigChanged, frontScale } = this.paintingScene.update(
      this.mapTextures,
      canvas,
      material,
      lighting,
      view3d,
      this.getMaxTextureSize(),
      showLampGizmos,
      mode3D,
      grid,
      this.buildCrossSectionInput(true),
      this.buildCursor3DInput(layout === 'split'),
    );
    if (shadowConfigChanged) {
      this.shadowDirty = true;
    }

    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const prevAspect = this.orbit3D.camera.aspect;
    const prevTarget = this.renderer.getRenderTarget();
    const prevToneMapping = this.renderer.toneMapping;
    const prevExposure = this.renderer.toneMappingExposure;

    const rt = new THREE.WebGLRenderTarget(w, h, {
      colorSpace: THREE.SRGBColorSpace,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    try {
      this.orbit3D.camera.aspect = w / h;
      this.orbit3D.camera.updateProjectionMatrix();
      if (this.shadowDirty && frontScale > 0 && lighting.front.castShadows) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowDirty = false;
      }
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = lighting.exposure;
      this.renderer.setRenderTarget(rt);
      this.renderer.render(this.paintingScene.scene, this.orbit3D.camera);

      const raw = new Uint8Array(w * h * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, raw);

      const flipped = new Uint8Array(w * h * 4);
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        const srcRow = (h - 1 - y) * rowBytes;
        flipped.set(raw.subarray(srcRow, srcRow + rowBytes), y * rowBytes);
      }
      return flipped;
    } finally {
      this.orbit3D.camera.aspect = prevAspect;
      this.orbit3D.camera.updateProjectionMatrix();
      this.renderer.toneMapping = prevToneMapping;
      this.renderer.toneMappingExposure = prevExposure;
      this.renderer.setRenderTarget(prevTarget);
      rt.dispose();
    }
  }

  /**
   * Synchronously renders the current frame to the default framebuffer and reads
   * an RGBA8 pixel at CSS coordinates relative to the WebGL canvas.
   */
  sampleRenderedPixel(cssX: number, cssY: number): [number, number, number, number] {
    if (this.disposed || this.contextLost || !this.params || !this.registry.isAllocated) {
      return [0, 0, 0, 0];
    }
    this.renderNow();
    const gl = this.renderer.getContext();
    const dpr = this.renderer.getPixelRatio();
    const px = Math.max(
      0,
      Math.min(gl.drawingBufferWidth - 1, Math.floor(cssX * dpr)),
    );
    const py = Math.max(
      0,
      Math.min(gl.drawingBufferHeight - 1, gl.drawingBufferHeight - 1 - Math.floor(cssY * dpr)),
    );
    const out = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0, out[3] ?? 0];
  }

  renderPreview(mode: LightingMode, longestSide: number): RenderedPreviewImage | null {
    if (this.disposed || this.contextLost || !this.registry.isAllocated || !this.params) {
      return null;
    }
    this.flushPendingResources();
    if (!this.mapTextures || !this.paintingScene) {
      return null;
    }
    const { canvas, material, lighting, view3d } = this.params;
    const result = renderOffscreenPreview({
      renderer: this.renderer,
      paintingScene: this.paintingScene,
      mapTextures: this.mapTextures,
      canvas,
      material,
      lighting,
      view3d,
      maxTextureSize: this.getMaxTextureSize(),
      mode,
      longestSide,
      forceShadowUpdate: this.shadowDirty,
    });
    if (lighting.front.castShadows) {
      this.shadowDirty = false;
    }
    this.invalidate();
    return result;
  }

  private syncSceneForStats(): boolean {
    if (!this.paintingScene || !this.params || !this.mapTextures) return false;
    const is3DVisible = this.params.layout === '3d' || this.params.layout === 'split';
    const effectiveMode = is3DVisible
      ? this.resolve3DLightingMode(this.params)
      : isLit2DMode(this.params.viewMode2D)
        ? this.params.viewMode2D
        : this.params.lighting.mode;
    this.paintingScene.update(
      this.mapTextures,
      this.params.canvas,
      this.params.material,
      this.params.lighting,
      this.params.view3d,
      this.getMaxTextureSize(),
      is3DVisible && this.params.showLampGizmos,
      effectiveMode,
      is3DVisible ? this.params.grid : undefined,
      is3DVisible ? this.buildCrossSectionInput(true) : undefined,
      this.params.layout === 'split' ? this.buildCursor3DInput(true) : undefined,
    );
    return true;
  }

  get3DStats(): CanvasMeshStats | null {
    if (!this.syncSceneForStats() || !this.paintingScene) return null;
    return this.paintingScene.getCanvasStats();
  }

  getFrontLightStats(): FrontLightStateSnapshot | null {
    if (!this.syncSceneForStats() || !this.paintingScene) return null;
    return this.paintingScene.getFrontLightStats();
  }

  getBackLightStats(): BackLightStateSnapshot | null {
    if (!this.syncSceneForStats() || !this.paintingScene) return null;
    return this.paintingScene.getBackLightStats();
  }

  getCrossSection3DStats(): CrossSection3DOverlayStats | null {
    if (!this.syncSceneForStats() || !this.paintingScene) return null;
    return this.paintingScene.getCrossSectionStats();
  }

  getCursor3DStats(): Cursor3DMarkerStats | null {
    if (!this.syncSceneForStats() || !this.paintingScene) return null;
    return this.paintingScene.getCursor3DStats();
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

  raycast3DCanvasPx(
    clientX: number,
    clientY: number,
    rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  ): Vec2 | null {
    if (
      this.disposed ||
      !this.params ||
      !this.registry.isAllocated ||
      (this.params.layout !== '3d' && this.params.layout !== 'split') ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    if (this.params.layout === 'split') {
      const { rightPane } = this.getSplitPanes();
      if (
        localX < rightPane.x ||
        localX > rightPane.x + rightPane.width ||
        localY < 0 ||
        localY > rightPane.height
      ) {
        return null;
      }
      this.rayNdc.x = ((localX - rightPane.x) / rightPane.width) * 2 - 1;
      this.rayNdc.y = -((localY / rightPane.height) * 2 - 1);
    } else {
      this.rayNdc.x = (localX / rect.width) * 2 - 1;
      this.rayNdc.y = -((localY / rect.height) * 2 - 1);
    }

    this.raycaster.setFromCamera(this.rayNdc, this.orbit3D.camera);
    const hit = this.raycaster.ray.intersectPlane(this.canvasPlaneZ0, this.rayHit);
    if (!hit) return null;

    const { canvas } = this.params;
    const halfW = canvas.widthCm / 2;
    const halfH = canvas.heightCm / 2;
    if (hit.x < -halfW || hit.x > halfW || hit.y < -halfH || hit.y > halfH) {
      return null;
    }

    const px = worldXYToPx(hit.x, hit.y, canvas);
    return {
      x: Math.min(canvas.widthPx - 1e-4, Math.max(0, px.x)),
      y: Math.min(canvas.heightPx - 1e-4, Math.max(0, px.y)),
    };
  }

  private flushPendingResources(): void {
    if (!this.params || !this.registry.isAllocated) return;
    const { canvas, material, lighting, view3d, grid, layout, viewMode2D, showLampGizmos } =
      this.params;

    const pixelDimsChanged =
      this.builtWidthPx !== this.registry.width || this.builtHeightPx !== this.registry.height;

    if (
      this.needsRebuild ||
      !this.mapTextures ||
      !this.paintingScene ||
      !this.flatMesh ||
      pixelDimsChanged
    ) {
      this.rebuildProject();
      return;
    }

    if (this.builtWidthCm !== canvas.widthCm || this.builtHeightCm !== canvas.heightCm) {
      const oldFlatGeo = this.flatMesh.geometry;
      this.flatMesh.geometry = createCanvasQuadGeometry(canvas.widthCm, canvas.heightCm);
      oldFlatGeo.dispose();
      this.builtWidthCm = canvas.widthCm;
      this.builtHeightCm = canvas.heightCm;
      this.shadowDirty = true;
    }

    const is3DVisible = layout === '3d' || layout === 'split';
    const effectiveMode = is3DVisible
      ? this.resolve3DLightingMode(this.params)
      : isLit2DMode(viewMode2D)
        ? viewMode2D
        : lighting.mode;

    const { shadowConfigChanged } = this.paintingScene.update(
      this.mapTextures,
      canvas,
      material,
      lighting,
      view3d,
      this.getMaxTextureSize(),
      is3DVisible && showLampGizmos,
      effectiveMode,
      is3DVisible ? grid : undefined,
      is3DVisible ? this.buildCrossSectionInput(true) : undefined,
      layout === 'split' ? this.buildCursor3DInput(true) : undefined,
    );
    if (shadowConfigChanged) {
      this.shadowDirty = true;
    }

    for (const mapId of ['color', 'height', 'opacity'] as const) {
      if (this.pendingFull[mapId]) {
        this.mapTextures.uploadFull(this.registry, mapId);
        this.pendingFull[mapId] = false;
        this.pendingDirty[mapId] = null;
        if (mapId === 'height') {
          this.shadowDirty = true;
        }
      } else {
        const dirty = this.pendingDirty[mapId];
        if (dirty) {
          this.mapTextures.uploadDirtyRect(this.renderer, this.registry, mapId, dirty);
          this.pendingDirty[mapId] = null;
          if (mapId === 'height') {
            this.shadowDirty = true;
          }
        }
      }
    }

    if (this.pendingMaskFull) {
      this.mapTextures.uploadMaskFull(this.registry);
      this.pendingMaskFull = false;
      this.pendingMaskDirty = null;
    } else if (this.pendingMaskDirty) {
      this.mapTextures.uploadMaskDirtyRect(this.renderer, this.registry, this.pendingMaskDirty);
      this.pendingMaskDirty = null;
    }
  }

  private disposeSceneResources(): void {
    if (this.flatMesh) {
      this.flatScene.remove(this.flatMesh);
      disposeObject3D(this.flatMesh, { disposeTextures: false });
      this.flatMesh = null;
      this.flatMaterial = null;
    }
    if (this.paintingScene) {
      this.paintingScene.dispose();
      this.paintingScene = null;
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
    this.unsubSelectionChanged();
    this.canvasElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvasElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.canvasElement.removeEventListener('pointerdown', this.handleCanvasPointerDownCapture, {
      capture: true,
    });
    this.canvasElement.removeEventListener('pointermove', this.handleCanvasPointerMoveCapture, {
      capture: true,
    });
    this.canvasElement.removeEventListener('wheel', this.handleCanvasWheelCapture, {
      capture: true,
    });
    window.removeEventListener('pointerup', this.handleWindowPointerUpCapture, { capture: true });
    window.removeEventListener('pointercancel', this.handleWindowPointerUpCapture, {
      capture: true,
    });
    this.orbit3D.dispose();
    this.disposeSceneResources();
    this.renderer.dispose();
  }
}
