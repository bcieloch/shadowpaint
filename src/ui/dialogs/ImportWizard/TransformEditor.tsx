import { useEffect, useRef, useState } from 'react';
import type { FitMode, ImportTransform } from '@/core/types';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Slider } from '@/ui/components/ui/slider';
import { useI18n } from '@/ui/hooks/useI18n';
import type { ImportSlotDraft } from '@/services/importService';

interface TransformEditorProps {
  slot: ImportSlotDraft;
  targetWidthPx: number;
  targetHeightPx: number;
  onChange: (nextTransform: ImportTransform) => void;
  onDone: () => void;
}

import { drawTransformedThumbnail } from '@/ui/dialogs/ImportWizard/previewCanvas';

export function TransformEditor({
  slot,
  targetWidthPx,
  targetHeightPx,
  onChange,
  onDone,
}: TransformEditorProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragging, setDragging] = useState<{ startX: number; startY: number; ox: number; oy: number } | null>(
    null,
  );

  const previewW = 240;
  const previewH = Math.max(80, Math.round((previewW * targetHeightPx) / targetWidthPx));

  useEffect(() => {
    if (!canvasRef.current) return;
    drawTransformedThumbnail(canvasRef.current, slot, targetWidthPx, targetHeightPx);
  }, [slot, targetWidthPx, targetHeightPx]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging({
      startX: e.clientX,
      startY: e.clientY,
      ox: slot.transform.offsetXPx,
      oy: slot.transform.offsetYPx,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const dx = ((e.clientX - dragging.startX) / previewW) * targetWidthPx;
    const dy = ((e.clientY - dragging.startY) / previewH) * targetHeightPx;
    onChange({
      ...slot.transform,
      offsetXPx: Math.round(dragging.ox + dx),
      offsetYPx: Math.round(dragging.oy + dy),
    });
  };

  return (
    <div className="space-y-2.5 rounded-md border border-primary/40 bg-background/80 p-2.5">
      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={previewW}
          height={previewH}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragging(null)}
          className="cursor-grab rounded border border-border active:cursor-grabbing"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{t('import.transformHint')}</p>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <Label>{t('import.transformScale')}</Label>
          <span className="font-mono">{slot.transform.scale.toFixed(2)}×</span>
        </div>
        <Slider
          value={[slot.transform.scale]}
          min={0.1}
          max={5}
          step={0.05}
          onValueChange={(vals) => {
            const scale = vals[0];
            if (scale !== undefined) onChange({ ...slot.transform, scale });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">{t('import.transformOffsetX')}</Label>
          <Input
            type="number"
            value={slot.transform.offsetXPx}
            onChange={(e) =>
              onChange({ ...slot.transform, offsetXPx: parseInt(e.target.value, 10) || 0 })
            }
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t('import.transformOffsetY')}</Label>
          <Input
            type="number"
            value={slot.transform.offsetYPx}
            onChange={(e) =>
              onChange({ ...slot.transform, offsetYPx: parseInt(e.target.value, 10) || 0 })
            }
            className="h-7 font-mono text-xs"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() =>
            onChange({
              ...slot.transform,
              scale: 1,
              offsetXPx: 0,
              offsetYPx: 0,
              rotate90: 0,
              flipH: false,
              flipV: false,
            })
          }
        >
          {t('common.reset')}
        </Button>
        <Button type="button" size="xs" onClick={onDone}>
          {t('import.doneTransform')}
        </Button>
      </div>
    </div>
  );
}

export type { FitMode };
