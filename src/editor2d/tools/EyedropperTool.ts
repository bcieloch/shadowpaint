import { valueToMm } from '@/core/units/calibration';
import { rgb01ToHex } from '@/core/units/colorTemperature';
import type { Tool, ToolContext, ToolPointerEvent } from '@/editor2d/tools/Tool';

export class EyedropperTool implements Tool {
  readonly id = 'eyedropper' as const;
  private sampling = false;

  onDown(e: ToolPointerEvent, ctx: ToolContext): void {
    this.sampling = true;
    this.sampleAt(e, ctx);
  }

  onMove(e: ToolPointerEvent, ctx: ToolContext): void {
    if (!this.sampling) return;
    this.sampleAt(e, ctx);
  }

  onUp(): void {
    this.sampling = false;
  }

  onCancel(): void {
    this.sampling = false;
  }

  private sampleAt(e: ToolPointerEvent, ctx: ToolContext): void {
    const { registry } = ctx;
    if (!registry.isAllocated) return;

    const px = Math.floor(e.imagePos.x);
    const py = Math.floor(e.imagePos.y);
    if (px < 0 || py < 0 || px >= registry.width || py >= registry.height) {
      return;
    }

    const { activeMap } = ctx.getEditor();
    const { canvas } = ctx.getProject();

    if (activeMap === 'color') {
      const idx = (py * registry.width + px) * 4;
      const effective = registry.color.effective;
      const hex = rgb01ToHex({
        r: (effective[idx] ?? 0) / 255,
        g: (effective[idx + 1] ?? 0) / 255,
        b: (effective[idx + 2] ?? 0) / 255,
      });
      ctx.setBrushOption('colorHex', hex);
      return;
    }

    if (activeMap === 'height') {
      const effective = registry.heightMap.effective;
      const v = effective[py * registry.width + px] ?? 0;
      const mm = valueToMm(v, canvas.minThicknessMm, canvas.maxThicknessMm);
      ctx.setBrushOption('heightMm', Math.round(mm * 1000) / 1000);
      return;
    }

    const effective = registry.opacity.effective;
    const v = effective[py * registry.width + px] ?? 0;
    ctx.setBrushOption('opacityPct', Math.round(v * 1000) / 10);
  }
}
