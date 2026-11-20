import { useMemo } from 'react';
import {
  buildHeightCssGradient,
  computeNiceScaleTicks,
} from '@/core/units/colormaps';
import type { HeightDisplayMode } from '@/state/editorStore';
import { useI18n } from '@/ui/hooks/useI18n';

export interface HeightLegendProps {
  mode: HeightDisplayMode;
  minMm: number;
  maxMm: number;
}

export function HeightLegend({ mode, minMm, maxMm }: HeightLegendProps) {
  const { t } = useI18n();
  const gradient = useMemo(() => buildHeightCssGradient(mode, 'to right', 20), [mode]);
  const ticks = useMemo(() => computeNiceScaleTicks(minMm, maxMm, 5), [minMm, maxMm]);

  return (
    <div
      data-testid="height-legend"
      className="pointer-events-none w-56 rounded-md border border-border bg-background/85 px-2.5 py-2 shadow-md backdrop-blur-sm"
    >
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
        <span>{t('viewport.legendHeightTitle')}</span>
        <span className="font-mono text-foreground">
          {minMm.toFixed(1)}–{maxMm.toFixed(1)} mm
        </span>
      </div>
      <div
        className="h-2.5 w-full rounded-sm border border-border/80"
        style={{ background: gradient }}
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        {ticks.map((v) => (
          <span key={v}>{Number.isInteger(v) ? v : v.toFixed(1)}</span>
        ))}
      </div>
    </div>
  );
}
