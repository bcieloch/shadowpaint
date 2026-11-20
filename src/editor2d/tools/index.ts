import { BlurTool } from '@/editor2d/tools/BlurTool';
import { BrushTool } from '@/editor2d/tools/BrushTool';
import { CrossSectionTool } from '@/editor2d/tools/CrossSectionTool';
import { EraserTool } from '@/editor2d/tools/EraserTool';
import { EyedropperTool } from '@/editor2d/tools/EyedropperTool';
import { FillTool } from '@/editor2d/tools/FillTool';
import { GradientTool } from '@/editor2d/tools/GradientTool';
import { MagicWandTool } from '@/editor2d/tools/MagicWandTool';
import { MaskBrushTool } from '@/editor2d/tools/MaskBrushTool';
import { PanTool } from '@/editor2d/tools/PanTool';
import { RulerTool } from '@/editor2d/tools/RulerTool';
import { SelectEllipseTool } from '@/editor2d/tools/SelectEllipseTool';
import { SelectLassoTool } from '@/editor2d/tools/SelectLassoTool';
import { SelectRectTool } from '@/editor2d/tools/SelectRectTool';
import { SmoothTool } from '@/editor2d/tools/SmoothTool';
import type { Tool } from '@/editor2d/tools/Tool';
import type { ToolId } from '@/state/editorStore';

export type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';

export function createToolRegistry(): Partial<Record<ToolId, Tool>> {
  return {
    brush: new BrushTool(),
    eraser: new EraserTool(),
    smooth: new SmoothTool(),
    blur: new BlurTool(),
    gradient: new GradientTool(),
    fill: new FillTool(),
    eyedropper: new EyedropperTool(),
    pan: new PanTool(),
    ruler: new RulerTool(),
    crossSection: new CrossSectionTool(),
    selectRect: new SelectRectTool(),
    selectEllipse: new SelectEllipseTool(),
    selectLasso: new SelectLassoTool(),
    magicWand: new MagicWandTool(),
    maskBrush: new MaskBrushTool(),
  };
}
