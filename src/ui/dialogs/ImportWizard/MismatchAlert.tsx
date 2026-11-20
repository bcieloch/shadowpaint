import { AlertTriangle } from 'lucide-react';
import type { CanvasSettings, FitMode, MapId } from '@/core/types';
import type { ImportMismatchInfo, ImportSlotsDraft } from '@/services/importService';
import { Button } from '@/ui/components/ui/button';
import { useI18n } from '@/ui/hooks/useI18n';

interface MismatchAlertProps {
  mismatches: ImportMismatchInfo;
  slots: ImportSlotsDraft;
  canvas: CanvasSettings;
  onApplyFitAll: (mode: FitMode) => void;
  onUseSlotResolution: (mapId: MapId) => void;
  onMatchCanvasAspect: (mapId: MapId) => void;
}

export function MismatchAlert({
  mismatches,
  slots,
  canvas,
  onApplyFitAll,
  onUseSlotResolution,
  onMatchCanvasAspect,
}: MismatchAlertProps) {
  const { t } = useI18n();
  const hasAny =
    mismatches.aspectMismatches.length > 0 ||
    mismatches.resolutionMismatch ||
    mismatches.upscaleWarnings.length > 0;

  if (!hasAny) return null;

  const firstPopulated = (['color', 'height', 'opacity'] as const).find((id) => slots[id] !== null);
  const canvasAspect = (canvas.widthCm / canvas.heightCm).toFixed(2);

  return (
    <div
      className="space-y-2 rounded-md border border-primary/50 bg-primary/10 p-3 text-xs"
      data-testid="import-mismatch-alert"
    >
      <div className="flex items-center gap-2 font-semibold text-primary">
        <AlertTriangle className="size-4 shrink-0" />
        <span>{t('import.mismatchTitle')}</span>
      </div>

      <ul className="list-disc space-y-0.5 pl-5 text-foreground/90">
        {mismatches.aspectMismatches.map((m) => (
          <li key={`aspect-${m.mapId}`}>
            {t('import.mismatchAspect', {
              slot: t(`maps.${m.mapId}` as const),
              srcAspect: m.srcAspect.toFixed(2),
              canvasAspect,
            })}
          </li>
        ))}
        {mismatches.resolutionMismatch && <li>{t('import.mismatchResolution')}</li>}
        {mismatches.upscaleWarnings.map((u) => (
          <li key={`up-${u.mapId}`}>
            {t('import.mismatchUpscale', {
              slot: t(`maps.${u.mapId}` as const),
              w: u.width,
              h: u.height,
              projW: canvas.widthPx,
              projH: canvas.heightPx,
            })}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button type="button" size="xs" variant="secondary" onClick={() => onApplyFitAll('fit')}>
          {t('import.actionFitAll')}
        </Button>
        <Button type="button" size="xs" variant="secondary" onClick={() => onApplyFitAll('fill')}>
          {t('import.actionFillAll')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          onClick={() => onApplyFitAll('stretch')}
        >
          {t('import.actionStretchAll')}
        </Button>
        {firstPopulated && (
          <>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onUseSlotResolution(firstPopulated)}
            >
              {t('import.actionUseSlotRes', { slot: t(`maps.${firstPopulated}Short` as const) })}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => onMatchCanvasAspect(firstPopulated)}
            >
              {t('import.actionMatchCanvasCm', { slot: t(`maps.${firstPopulated}Short` as const) })}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
