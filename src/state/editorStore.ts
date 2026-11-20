import { create } from 'zustand';
import { DEFAULT_COLOR_HEX } from '@/core/constants';
import type { LightingMode, MapId, Vec2 } from '@/core/types';

export type ToolId =
  | 'brush'
  | 'eraser'
  | 'smooth'
  | 'blur'
  | 'gradient'
  | 'fill'
  | 'eyedropper'
  | 'pan'
  | 'selectRect'
  | 'selectEllipse'
  | 'selectLasso'
  | 'magicWand'
  | 'maskBrush'
  | 'ruler'
  | 'crossSection';

export type LayoutMode = '2d' | '3d' | 'split';

export type ViewMode2D = 'color' | 'height' | 'opacity' | 'front' | 'back' | 'combined';

export type HeightDisplayMode = 'gray' | 'heat' | 'topo';

export interface BrushOptions {
  sizeValue: number;
  sizeUnit: 'px' | 'cm';
  hardness: number;
  flow: number;
  spacing: number;
  usePressure: boolean;
  mode: 'set' | 'raise' | 'lower';
  colorHex: string;
  heightMm: number;
  opacityPct: number;
}

export interface Pane2DState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface LineSegment {
  p0: Vec2;
  p1: Vec2;
}

export interface EditorState {
  activeMap: MapId;
  tool: ToolId;
  brush: BrushOptions;
  layout: LayoutMode;
  viewMode2D: ViewMode2D;
  view3DLighting: LightingMode;
  heightDisplay: HeightDisplayMode;
  heightContourStepMm: number;
  showLampGizmos: boolean;
  pane2D: Pane2DState;
  splitRatio: number;
  rulerLine: LineSegment | null;
  crossSectionLine: LineSegment | null;
  setActiveMap: (mapId: MapId) => void;
  setTool: (tool: ToolId) => void;
  setBrushOption: <K extends keyof BrushOptions>(key: K, value: BrushOptions[K]) => void;
  setLayout: (layout: LayoutMode) => void;
  setViewMode2D: (mode: ViewMode2D) => void;
  setView3DLighting: (mode: LightingMode) => void;
  setHeightDisplay: (mode: HeightDisplayMode) => void;
  setHeightContourStepMm: (stepMm: number) => void;
  setShowLampGizmos: (show: boolean) => void;
  setPane2D: (pane: Partial<Pane2DState>) => void;
  setSplitRatio: (ratio: number) => void;
  setRulerLine: (line: LineSegment | null) => void;
  setCrossSectionLine: (line: LineSegment | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeMap: 'height',
  tool: 'brush',
  brush: {
    sizeValue: 40,
    sizeUnit: 'px',
    hardness: 0.75,
    flow: 0.8,
    spacing: 0.15,
    usePressure: true,
    mode: 'set',
    colorHex: DEFAULT_COLOR_HEX,
    heightMm: 2.5,
    opacityPct: 50,
  },
  layout: '2d',
  viewMode2D: 'color',
  view3DLighting: 'combined',
  heightDisplay: 'gray',
  heightContourStepMm: 0.5,
  showLampGizmos: true,
  pane2D: { zoom: 1, panX: 0, panY: 0 },
  splitRatio: 0.5,
  rulerLine: null,
  crossSectionLine: null,
  setActiveMap: (activeMap) => set({ activeMap }),
  setTool: (tool) => set({ tool }),
  setBrushOption: (key, value) => set((s) => ({ brush: { ...s.brush, [key]: value } })),
  setLayout: (layout) => set({ layout }),
  setViewMode2D: (viewMode2D) => set({ viewMode2D }),
  setView3DLighting: (view3DLighting) => set({ view3DLighting }),
  setHeightDisplay: (heightDisplay) => set({ heightDisplay }),
  setHeightContourStepMm: (heightContourStepMm) => set({ heightContourStepMm }),
  setShowLampGizmos: (showLampGizmos) => set({ showLampGizmos }),
  setPane2D: (pane) => set((s) => ({ pane2D: { ...s.pane2D, ...pane } })),
  setSplitRatio: (splitRatio) => set({ splitRatio }),
  setRulerLine: (rulerLine) => set({ rulerLine }),
  setCrossSectionLine: (crossSectionLine) => set({ crossSectionLine }),
}));
