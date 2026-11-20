import type { Tool } from '@/editor2d/tools/Tool';

export class PanTool implements Tool {
  readonly id = 'pan' as const;

  onDown(): void {
    // Handled by PointerRouter panning state
  }

  onMove(): void {
    // Handled by PointerRouter panning state
  }

  onUp(): void {
    // Handled by PointerRouter panning state
  }

  onCancel(): void {
    // Handled by PointerRouter panning state
  }
}
