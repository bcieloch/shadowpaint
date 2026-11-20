import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_MEGAPIXELS_WARNING } from '@/core/constants';
import { MapRegistry } from '@/core/maps/MapRegistry';
import type { CanvasSettings } from '@/core/types';
import { getMaxTextureSize } from '@/lib/webgl';
import { resizeProject } from '@/services/projectService';
import { Button } from '@/ui/components/ui/button';
import { Checkbox } from '@/ui/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/ui/dialog';
import { Label } from '@/ui/components/ui/label';
import { useI18n } from '@/ui/hooks/useI18n';

export interface ResizeProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCanvas: CanvasSettings;
  targetCanvas: CanvasSettings;
  onSuccess?: () => void;
}

export function ResizeProjectDialog({
  open,
  onOpenChange,
  currentCanvas,
  targetCanvas,
  onSuccess,
}: ResizeProjectDialogProps) {
  const { t } = useI18n();
  const [confirmed, setConfirmed] = useState(false);
  const [resizing, setResizing] = useState(false);

  const maxTextureSize = useMemo(() => getMaxTextureSize(), []);
  const pixelCount = targetCanvas.widthPx * targetCanvas.heightPx;
  const megapixels = pixelCount / 1_000_000;
  const estimatedMb = Math.round(
    MapRegistry.estimateBytes(targetCanvas.widthPx, targetCanvas.heightPx) / (1024 * 1024),
  );
  const showMemoryWarning = pixelCount > MAX_MEGAPIXELS_WARNING;

  const handleOpenChange = (nextOpen: boolean) => {
    if (resizing) return;
    if (!nextOpen) {
      setConfirmed(false);
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (!confirmed || resizing) return;
    setResizing(true);
    try {
      const result = await resizeProject(targetCanvas, maxTextureSize);
      if (!result.ok) {
        if (result.error === 'outOfMemory') {
          toast.error(t('newProject.outOfMemoryError', { mb: result.requiredMb }));
        }
        return;
      }

      toast.success(
        t('canvas.resizeSuccessToast', {
          wPx: targetCanvas.widthPx,
          hPx: targetCanvas.heightPx,
          wCm: targetCanvas.widthCm,
          hCm: targetCanvas.heightCm,
        }),
      );
      setConfirmed(false);
      onOpenChange(false);
      onSuccess?.();
    } finally {
      setResizing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="bg-card text-foreground max-w-md"
        data-testid="resize-project-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t('canvas.resizeDialogTitle')}</DialogTitle>
          <DialogDescription>{t('canvas.resizeDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="border-border bg-background/70 text-muted-foreground space-y-1 rounded-md border p-2.5 font-mono">
            <div>
              {t('canvas.resizeSummaryCurrent', {
                wPx: currentCanvas.widthPx,
                hPx: currentCanvas.heightPx,
                wCm: currentCanvas.widthCm,
                hCm: currentCanvas.heightCm,
              })}
            </div>
            <div className="text-foreground">
              {t('canvas.resizeSummaryTarget', {
                wPx: targetCanvas.widthPx,
                hPx: targetCanvas.heightPx,
                wCm: targetCanvas.widthCm,
                hCm: targetCanvas.heightCm,
                mp: megapixels.toFixed(2),
                mb: estimatedMb,
              })}
            </div>
          </div>

          {showMemoryWarning && (
            <div className="border-primary/40 bg-primary/10 text-primary flex items-start gap-2 rounded-md border p-2.5 text-xs">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {t('newProject.highMemoryWarning', {
                  mp: megapixels.toFixed(1),
                  mb: estimatedMb,
                })}
              </span>
            </div>
          )}

          <div className="border-primary/40 bg-primary/10 flex items-start gap-2 rounded-md border p-2.5 text-xs">
            <AlertTriangle className="text-primary mt-0.5 size-4 shrink-0" />
            <div className="space-y-2">
              <p className="text-foreground leading-snug">{t('canvas.resizeHistoryWarning')}</p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="resize-confirm-checkbox"
                  data-testid="resize-confirm-checkbox"
                  checked={confirmed}
                  disabled={resizing}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                />
                <Label
                  htmlFor="resize-confirm-checkbox"
                  className="text-xs leading-snug font-normal"
                >
                  {t('canvas.resizeConfirmCheckbox')}
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={resizing}
            onClick={() => handleOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!confirmed || resizing}
            onClick={() => void handleConfirm()}
            data-testid="resize-confirm-submit"
          >
            {resizing ? t('common.loading') : t('canvas.resizeConfirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
