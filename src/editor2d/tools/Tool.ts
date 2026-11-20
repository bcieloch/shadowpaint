import type { NewHistoryEntry, TilesMapHistoryEntry } from '@/core/history/commands';
import type { MapRegistry } from '@/core/maps/MapRegistry';
import type { MapId, ProjectSettings, Vec2 } from '@/core/types';
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
  setBrushOption: <K extends keyof BrushOptions>(key: K, value: BrushOptions[K]) => void;
  onLockedMapAttempt: (mapId: MapId) => void;
  recordMapTileEntry?: (entry: NewHistoryEntry<TilesMapHistoryEntry>) => void;
}

export interface Tool {
  readonly id: ToolId;
  onDown(e: ToolPointerEvent, ctx: ToolContext): void;
  onMove(e: ToolPointerEvent, ctx: ToolContext): void;
  onUp(e: ToolPointerEvent, ctx: ToolContext): void;
  onCancel(ctx: ToolContext): void;
}
