import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { CanvasSettings, FitMode, ImportTransform, MapId } from '@/core/types';
import {
  applyImportToProject,
  buildCanvasForSlotAspect,
  buildCanvasForSlotResolution,
  classifyDecodeError,
  decodeFileToSlot,
  detectImportMismatches,
  useImportDraftStore,
} from '@/services/importService';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/ui/dialog';
import { ScrollArea } from '@/ui/components/ui/scroll-area';
import { ComparePreview } from '@/ui/dialogs/ImportWizard/ComparePreview';
import { MismatchAlert } from '@/ui/dialogs/ImportWizard/MismatchAlert';
import { SlotCard } from '@/ui/dialogs/ImportWizard/SlotCard';
import { useI18n } from '@/ui/hooks/useI18n';

export function ImportWizardDialog() {
  const { t } = useI18n();
  const open = useUiStore((s) => s.dialogs.importWizardOpen);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);
  const projectCanvas = useProjectStore((s) => s.project.canvas);
  const slots = useImportDraftStore((s) => s.slots);
  const setSlot = useImportDraftStore((s) => s.setSlot);
  const updateSlot = useImportDraftStore((s) => s.updateSlot);
  const swapSlots = useImportDraftStore((s) => s.swapSlots);

  const [overrideCanvas, setOverrideCanvas] = useState<CanvasSettings | null>(null);
  const [applying, setApplying] = useState(false);

  const targetCanvas = overrideCanvas ?? projectCanvas;

  const mismatches = useMemo(
    () => detectImportMismatches(slots, targetCanvas),
    [slots, targetCanvas],
  );

  const hasAnySlot = slots.color !== null || slots.height !== null || slots.opacity !== null;

  const handleSelectFile = async (mapId: MapId, file: File) => {
    try {
      await decodeFileToSlot(file, mapId);
    } catch (err) {
      const code = classifyDecodeError(err);
      toast.error(t(`import.errors.${code}` as const, { name: file.name }));
    }
  };

  const handleFitAll = (mode: FitMode) => {
    for (const id of ['color', 'height', 'opacity'] as const) {
      updateSlot(id, (prev) => ({ ...prev, fit: mode }));
    }
  };

  const handleUseSlotResolution = (mapId: MapId) => {
    const slot = slots[mapId];
    if (!slot) return;
    setOverrideCanvas(buildCanvasForSlotResolution(targetCanvas, slot));
  };

  const handleMatchCanvasAspect = (mapId: MapId) => {
    const slot = slots[mapId];
    if (!slot) return;
    setOverrideCanvas(buildCanvasForSlotAspect(targetCanvas, slot));
  };

  const handleApply = async () => {
    if (!hasAnySlot || applying) return;
    setApplying(true);
    try {
      const res = await applyImportToProject(slots, overrideCanvas ?? undefined);
      if (!res.ok) {
        toast.error(t('newProject.outOfMemoryError', { mb: res.requiredMb }));
        return;
      }
      toast.success(t('import.importSuccess'));
      setOverrideCanvas(null);
      setDialogOpen('importWizardOpen', false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setOverrideCanvas(null);
        setDialogOpen('importWizardOpen', v);
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>{t('import.wizardTitle')}</DialogTitle>
          <DialogDescription>
            {t('import.wizardDescription')} ({targetCanvas.widthCm} × {targetCanvas.heightCm} cm ·{' '}
            {targetCanvas.widthPx} × {targetCanvas.heightPx} px)
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 pr-2">
          <div className="space-y-3 py-1">
            <MismatchAlert
              mismatches={mismatches}
              slots={slots}
              canvas={targetCanvas}
              onApplyFitAll={handleFitAll}
              onUseSlotResolution={handleUseSlotResolution}
              onMatchCanvasAspect={handleMatchCanvasAspect}
            />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(['color', 'height', 'opacity'] as const).map((id) => (
                <SlotCard
                  key={id}
                  mapId={id}
                  slot={slots[id]}
                  targetWidthPx={targetCanvas.widthPx}
                  targetHeightPx={targetCanvas.heightPx}
                  onSelectFile={handleSelectFile}
                  onChangeFit={(mapId, fit) => updateSlot(mapId, (p) => ({ ...p, fit }))}
                  onChangeTransform={(mapId, transform: ImportTransform) =>
                    updateSlot(mapId, (p) => ({ ...p, transform }))
                  }
                  onSwapWith={(other) => swapSlots(id, other)}
                  onClear={(mapId) => setSlot(mapId, null)}
                />
              ))}
            </div>

            {hasAnySlot && (
              <ComparePreview
                slots={slots}
                targetWidthPx={targetCanvas.widthPx}
                targetHeightPx={targetCanvas.heightPx}
              />
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDialogOpen('importWizardOpen', false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!hasAnySlot || applying}
            onClick={handleApply}
            data-testid="import-apply-btn"
          >
            {applying ? t('common.loading') : t('import.applyImport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
