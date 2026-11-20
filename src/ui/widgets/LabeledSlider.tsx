import { useId } from 'react';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Slider } from '@/ui/components/ui/slider';

interface LabeledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  suffix?: string;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
}

export function LabeledSlider({
  label,
  value,
  min,
  max,
  step = 1,
  decimals = 0,
  suffix = '',
  onValueChange,
  onValueCommit,
}: LabeledSliderProps) {
  const id = useId();
  const clamped = Math.max(min, Math.min(max, value));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
          {label}
        </Label>
        <div className="flex items-center gap-1">
          <Input
            id={id}
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
          {suffix && <span className="font-mono text-[11px] text-muted-foreground">{suffix}</span>}
        </div>
      </div>
      <Slider
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
