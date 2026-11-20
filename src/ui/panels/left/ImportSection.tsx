import { useState } from 'react';
import { FolderInput, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import type { MapId } from '@/core/types';
import { classifyDecodeError, decodeFileToSlot } from '@/services/importService';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';

export function ImportSection() {
  const { t } = useI18n();
  const mapsMeta = useProjectStore((s) => s.project.maps);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);
  const [dragSlot, setDragSlot] = useState<MapId | null>(null);

  const handleDropToSlot = async (mapId: MapId, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragSlot(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      await decodeFileToSlot(file, mapId);
      setDialogOpen('importWizardOpen', true);
    } catch (err) {
      const code = classifyDecodeError(err);
      toast.error(t(`import.errors.${code}` as const, { name: file.name }));
    }
  };

  return (
    <section className="space-y-2 border-b border-border p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {t('import.sectionTitle')}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              className="h-6 gap-1 px-2 text-[11px]"
              onClick={() => setDialogOpen('importWizardOpen', true)}
              data-testid="btn-import-wizard"
            >
              <FolderInput className="size-3" />
              <span>{t('import.openWizard')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('import.openWizardTooltip')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="space-y-1.5">
        {(['color', 'height', 'opacity'] as const).map((id) => {
          const source = mapsMeta[id].source;
          const isOver = dragSlot === id;
          return (
            <div
              key={id}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragSlot(id);
              }}
              onDragLeave={() => setDragSlot(null)}
              onDrop={(e) => handleDropToSlot(id, e)}
              onClick={() => setDialogOpen('importWizardOpen', true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDialogOpen('importWizardOpen', true);
                }
              }}
              className={`flex cursor-pointer items-center justify-between rounded border px-2 py-1.5 text-xs transition-colors ${
                isOver
                  ? 'border-primary bg-primary/15'
                  : 'border-border bg-background/60 hover:border-border/80 hover:bg-accent/50'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">{t(`maps.${id}` as const)}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {source
                    ? `${source.fileName} (${source.widthPx}×${source.heightPx})`
                    : t('import.notImported')}
                </div>
              </div>
              <ImagePlus className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
