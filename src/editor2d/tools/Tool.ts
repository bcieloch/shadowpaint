import type { NewHistoryEntry, TilesMapHistoryEntry } from '@/core/history/commands';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import type { LineSegment, MapId, ProjectSettings, Vec2 } from '@/core/types';
import type { SelectionDraftPreview } from '@/editor2d/overlay/OverlayRenderer';
import type { BrushOptions, EditorState, ToolId } from '@/state/editorStore';

export interface ToolPointerEvent {
  imagePos: Vec2;
  screenPos: Vec2;
  pressure: number;
  pointerType: string;
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ToolContext {
  registry: MapRegistry;
  getProject: () => ProjectSettings;
  getEditor: () => EditorState;
  getZoom?: () => number;
  setBrushOption: <K extends keyof BrushOptions>(key: K, value: BrushOptions[K]) => void;
  setRulerLine?: (line: LineSegment | null) => void;
  setCrossSectionLine?: (line: LineSegment | null) => void;
  onLockedMapAttempt: (mapId: MapId) => void;
  recordMapTileEntry?: (entry: NewHistoryEntry<TilesMapHistoryEntry>) => void;
}

export interface Tool {
  readonly id: ToolId;
  onDown(e: ToolPointerEvent, ctx: ToolContext): void;
  onMove(e: ToolPointerEvent, ctx: ToolContext): void;
  onUp(e: ToolPointerEvent, ctx: ToolContext): void;
  onCancel(ctx: ToolContext): void;
  getOverlayPreview?(): SelectionDraftPreview | null;
}
