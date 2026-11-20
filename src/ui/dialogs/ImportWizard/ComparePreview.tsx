import { useEffect, useRef, useState } from 'react';
import type { MapId } from '@/core/types';
import type { ImportSlotsDraft } from '@/services/importService';
import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { Slider } from '@/ui/components/ui/slider';
import { Switch } from '@/ui/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/ui/tabs';
import { drawTransformedThumbnail } from '@/ui/dialogs/ImportWizard/previewCanvas';
import { useI18n } from '@/ui/hooks/useI18n';

interface ComparePreviewProps {
  slots: ImportSlotsDraft;
  targetWidthPx: number;
  targetHeightPx: number;
}

export function ComparePreview({ slots, targetWidthPx, targetHeightPx }: ComparePreviewProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'sideBySide' | 'overlay'>('sideBySide');
  const [slotA, setSlotA] = useState<MapId>('color');
  const [slotB, setSlotB] = useState<MapId>('height');
  const [blend, setBlend] = useState(0.5);
  const [difference, setDifference] = useState(false);

  const refColor = useRef<HTMLCanvasElement | null>(null);
  const refHeight = useRef<HTMLCanvasElement | null>(null);
  const refOpacity = useRef<HTMLCanvasElement | null>(null);
  const refOverlay = useRef<HTMLCanvasElement | null>(null);

  const tileW = 160;
  const tileH = Math.max(60, Math.round((tileW * targetHeightPx) / targetWidthPx));

  useEffect(() => {
    if (mode !== 'sideBySide') return;
    const refs: Record<MapId, HTMLCanvasElement | null> = {
      color: refColor.current,
      height: refHeight.current,
      opacity: refOpacity.current,
    };
    for (const id of ['color', 'height', 'opacity'] as const) {
      const canvas = refs[id];
      const slot = slots[id];
      if (!canvas) continue;
      if (slot) {
        drawTransformedThumbnail(canvas, slot, targetWidthPx, targetHeightPx);
      } else {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0f0f12';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }, [mode, slots, targetWidthPx, targetHeightPx]);

  useEffect(() => {
    if (mode !== 'overlay' || !refOverlay.current) return;
    const outCanvas = refOverlay.current;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return;

    const w = outCanvas.width;
    const h = outCanvas.height;
    const cA = document.createElement('canvas');
    cA.width = w;
    cA.height = h;
    const cB = document.createElement('canvas');
    cB.width = w;
    cB.height = h;

    if (slots[slotA]) {
      drawTransformedThumbnail(cA, slots[slotA], targetWidthPx, targetHeightPx);
    }
    if (slots[slotB]) {
      drawTransformedThumbnail(cB, slots[slotB], targetWidthPx, targetHeightPx);
    }

    const dA = cA.getContext('2d')?.getImageData(0, 0, w, h).data;
    const dB = cB.getContext('2d')?.getImageData(0, 0, w, h).data;
    if (!dA || !dB) return;

    const outImg = outCtx.createImageData(w, h);
    const dst = outImg.data;

    for (let i = 0; i < dst.length; i += 4) {
      if (difference) {
        dst[i] = Math.abs((dA[i] ?? 0) - (dB[i] ?? 0));
        dst[i + 1] = Math.abs((dA[i + 1] ?? 0) - (dB[i + 1] ?? 0));
        dst[i + 2] = Math.abs((dA[i + 2] ?? 0) - (dB[i + 2] ?? 0));
        dst[i + 3] = 255;
      } else {
        dst[i] = Math.round((dA[i] ?? 0) * (1 - blend) + (dB[i] ?? 0) * blend);
        dst[i + 1] = Math.round((dA[i + 1] ?? 0) * (1 - blend) + (dB[i + 1] ?? 0) * blend);
        dst[i + 2] = Math.round((dA[i + 2] ?? 0) * (1 - blend) + (dB[i + 2] ?? 0) * blend);
        dst[i + 3] = 255;
      }
    }
    outCtx.putImageData(outImg, 0, 0);
  }, [mode, slots, slotA, slotB, blend, difference, targetWidthPx, targetHeightPx]);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{t('import.compareTitle')}</span>
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'sideBySide' | 'overlay')}>
          <TabsList className="h-7">
            <TabsTrigger value="sideBySide" className="h-5 px-2 text-[11px]">
              {t('import.compareSideBySide')}
            </TabsTrigger>
            <TabsTrigger value="overlay" className="h-5 px-2 text-[11px]">
              {t('import.compareOverlay')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sideBySide" className="hidden" />
          <TabsContent value="overlay" className="hidden" />
        </Tabs>
      </div>

      {mode === 'sideBySide' ? (
        <div className="grid grid-cols-3 gap-3">
          {(['color', 'height', 'opacity'] as const).map((id) => (
            <div key={id} className="flex flex-col items-center gap-1">
              <canvas
                ref={id === 'color' ? refColor : id === 'height' ? refHeight : refOpacity}
                width={tileW}
                height={tileH}
                className="max-h-36 w-auto rounded border border-border"
              />
              <span className="text-[11px] text-muted-foreground">{t(`maps.${id}` as const)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <canvas
            ref={refOverlay}
            width={220}
            height={Math.max(80, Math.round((220 * targetHeightPx) / targetWidthPx))}
            className="max-h-44 w-auto rounded border border-border"
          />
          <div className="flex-1 space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">{t('import.compareSlotA')}</Label>
                <Select value={slotA} onValueChange={(v) => setSlotA(v as MapId)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color">{t('maps.colorShort')}</SelectItem>
                    <SelectItem value="height">{t('maps.heightShort')}</SelectItem>
                    <SelectItem value="opacity">{t('maps.opacityShort')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">{t('import.compareSlotB')}</Label>
                <Select value={slotB} onValueChange={(v) => setSlotB(v as MapId)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color">{t('maps.colorShort')}</SelectItem>
                    <SelectItem value="height">{t('maps.heightShort')}</SelectItem>
                    <SelectItem value="opacity">{t('maps.opacityShort')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <Label>{t('import.compareBlend')}</Label>
                <span className="font-mono">{Math.round(blend * 100)}%</span>
              </div>
              <Slider
                value={[blend]}
                min={0}
                max={1}
                step={0.01}
                disabled={difference}
                onValueChange={(vals) => {
                  const v = vals[0];
                  if (v !== undefined) setBlend(v);
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch id="cmp-diff" checked={difference} onCheckedChange={setDifference} />
              <Label htmlFor="cmp-diff" className="text-xs font-normal">
                {t('import.compareDifference')}
              </Label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
