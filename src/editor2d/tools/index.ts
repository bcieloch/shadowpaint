import { BrushTool } from '@/editor2d/tools/BrushTool';
import { EraserTool } from '@/editor2d/tools/EraserTool';
import { EyedropperTool } from '@/editor2d/tools/EyedropperTool';
import { PanTool } from '@/editor2d/tools/PanTool';
import type { Tool } from '@/editor2d/tools/Tool';
import type { ToolId } from '@/state/editorStore';

export type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';

export function createToolRegistry(): Partial<Record<ToolId, Tool>> {
  return {
    brush: new BrushTool(),
    eraser: new EraserTool(),
    eyedropper: new EyedropperTool(),
    pan: new PanTool(),
  };
}
