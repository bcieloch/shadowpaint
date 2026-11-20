import { useId, useRef, useState } from 'react';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';

export interface UnitNumberFieldProps {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  integer?: boolean;
  suffix?: string;
  disabled?: boolean;
  testId?: string;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
}

export function UnitNumberField({
  id: explicitId,
  label,
  value,
  min,
  max,
  step = 1,
  decimals = 2,
  integer = false,
  suffix,
  disabled = false,
  testId,
  onValueChange,
  onValueCommit,
}: UnitNumberFieldProps) {
  const autoId = useId();
  const id = explicitId ?? autoId;
  const [editingText, setEditingText] = useState<string | null>(null);
  const scrubStartRef = useRef<{ clientX: number; startValue: number } | null>(null);

  const normalize = (raw: number): number => {
    const clamped = Math.max(min, Math.min(max, raw));
    if (integer) return Math.round(clamped);
    return Number(clamped.toFixed(decimals));
  };

  const formatValue = (v: number): string => {
    if (!Number.isFinite(v)) return '';
    if (integer) return String(Math.round(v));
    return String(Number(v.toFixed(decimals)));
  };

  const commitText = (rawText: string) => {
    const parsed = integer ? parseInt(rawText, 10) : parseFloat(rawText);
    setEditingText(null);
    if (!Number.isFinite(parsed)) return;
    const next = normalize(parsed);
    onValueChange(next);
    onValueCommit?.(next);
  };

  const handleStep = (delta: number) => {
    if (disabled) return;
    const base = editingText !== null ? parseFloat(editingText) : value;
    const current = Number.isFinite(base) ? base : value;
    const next = normalize(current + delta);
    setEditingText(null);
    onValueChange(next);
    onValueCommit?.(next);
  };

  const startScrub = (e: React.PointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    scrubStartRef.current = { clientX: e.clientX, startValue: value };
  };

  const moveScrub = (e: React.PointerEvent<HTMLElement>) => {
    const drag = scrubStartRef.current;
    if (!drag) return;
    const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const dx = e.clientX - drag.clientX;
    const deltaSteps = Math.round(dx / 3) * step * multiplier;
    const next = normalize(drag.startValue + deltaSteps);
    setEditingText(null);
    onValueChange(next);
  };

  const endScrub = (e: React.PointerEvent<HTMLElement>) => {
    const drag = scrubStartRef.current;
    if (!drag) return;
    scrubStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const dx = e.clientX - drag.clientX;
    const deltaSteps = Math.round(dx / 3) * step * multiplier;
    const next = normalize(drag.startValue + deltaSteps);
    onValueChange(next);
    onValueCommit?.(next);
  };

  return (
    <div className="space-y-1">
      <Label
        htmlFor={id}
        onPointerDown={startScrub}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        className="text-muted-foreground block cursor-ew-resize text-[11px] font-normal select-none"
      >
        {label}
      </Label>
      <div className="relative flex items-center">
        <Input
          id={id}
          data-testid={testId}
          type="number"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={editingText ?? formatValue(value)}
          onFocus={() => setEditingText(formatValue(value))}
          onChange={(e) => {
            const raw = e.target.value;
            setEditingText(raw);
            const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
            if (Number.isFinite(parsed)) {
              onValueChange(parsed);
            }
          }}
          onBlur={() => {
            if (editingText !== null) {
              commitText(editingText);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText(editingText ?? formatValue(value));
            } else if (e.key === 'Escape') {
              setEditingText(null);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              handleStep(step * (e.shiftKey ? 10 : 1));
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              handleStep(-step * (e.shiftKey ? 10 : 1));
            }
          }}
          className={`h-7 font-mono text-xs ${suffix ? 'pr-11' : ''}`}
        />
        {suffix && (
          <span
            onPointerDown={startScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
            className="text-muted-foreground pointer-events-auto absolute right-2 cursor-ew-resize font-mono text-[10px] select-none"
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
