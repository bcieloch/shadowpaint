import type { ReactNode } from 'react';
import { useId } from 'react';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Slider } from '@/ui/components/ui/slider';
import { useI18n } from '@/ui/hooks/useI18n';

interface LabeledSliderProps {
  label: string;
  headerExtra?: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  suffix?: string;
  testId?: string;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
}

export function LabeledSlider({
  label,
  headerExtra,
  value,
  min,
  max,
  step = 1,
  decimals = 0,
  suffix = '',
  testId,
  onValueChange,
  onValueCommit,
}: LabeledSliderProps) {
  const { t } = useI18n();
  const id = useId();
  const clamped = Math.max(min, Math.min(max, value));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="text-muted-foreground text-xs font-normal">
            {label}
          </Label>
          {headerExtra}
        </div>
        <div className="flex items-center gap-1">
          <Input
            id={id}
            data-testid={testId}
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number(clamped.toFixed(decimals))}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              if (Number.isFinite(parsed)) {
                const next = Math.max(min, Math.min(max, parsed));
                onValueChange(next);
                onValueCommit?.(next);
              }
            }}
            className="h-6 w-16 px-1.5 text-right font-mono text-[11px]"
          />
          {suffix && <span className="text-muted-foreground font-mono text-[11px]">{suffix}</span>}
        </div>
      </div>
      <Slider
        aria-label={t('common.sliderLabel', { label })}
        value={[clamped]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => {
          const v = vals[0];
          if (v !== undefined) onValueChange(v);
        }}
        onValueCommit={(vals) => {
          const v = vals[0];
          if (v !== undefined) onValueCommit?.(v);
        }}
      />
    </div>
  );
}
