import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';
import { runMagicWandAt } from '@/services/selectionService';

export class MagicWandTool implements Tool {
  readonly id = 'magicWand' as const;

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (!ctx.registry.isAllocated) return;
    if (
      e.imagePos.x < 0 ||
      e.imagePos.y < 0 ||
      e.imagePos.x >= ctx.registry.width ||
      e.imagePos.y >= ctx.registry.height
    ) {
      return;
    }
    void runMagicWandAt(e.imagePos.x, e.imagePos.y);
  }

  onMove(): void {
    // Magic Wand samples on click
  }

  onUp(): void {
    // Nothing extra needed on release
  }

  onCancel(): void {
    // No stateful drag to roll back
  }
}
