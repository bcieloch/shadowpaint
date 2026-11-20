import { useEffect, useState } from 'react';
import { FolderArchive, ImageDown } from 'lucide-react';
import { toast } from 'sonner';
import type { MapId } from '@/core/types';
import { isReliefArchiveFileName, requestOpenReliefFile } from '@/services/fileService';
import { classifyDecodeError, decodeFileToSlot } from '@/services/importService';
import { useUiStore } from '@/state/uiStore';
import { useI18n } from '@/ui/hooks/useI18n';

export function WindowDropOverlay() {
  const { t } = useI18n();
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);
  const [active, setActive] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<MapId | 'relief' | null>(null);

  useEffect(() => {
    let dragDepth = 0;

    const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files') ?? false;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      setActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        setActive(false);
        setHoverTarget(null);
      }
    };
    const onDrop = (e: DragEvent) => {
      dragDepth = 0;
      setActive(false);
      setHoverTarget(null);
      if (hasFiles(e)) {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file && isReliefArchiveFileName(file.name)) {
          void requestOpenReliefFile(file);
        }
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!active) return null;

  const handleDropSlot = async (mapId: MapId, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActive(false);
    setHoverTarget(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (isReliefArchiveFileName(file.name)) {
      await requestOpenReliefFile(file);
      return;
    }
    try {
      await decodeFileToSlot(file, mapId);
      setDialogOpen('importWizardOpen', true);
    } catch (err) {
      const code = classifyDecodeError(err);
      toast.error(t(`import.errors.${code}` as const, { name: file.name }));
    }
  };

  const handleDropRelief = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActive(false);
    setHoverTarget(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await requestOpenReliefFile(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/85 backdrop-blur-xs"
      data-testid="window-drop-overlay"
    >
      <div
        data-testid="window-drop-relief"
        onDragOver={(e) => {
          e.preventDefault();
          setHoverTarget('relief');
        }}
        onDragLeave={() => setHoverTarget(null)}
        onDrop={(e) => void handleDropRelief(e)}
        className={`flex w-full max-w-2xl flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors ${
          hoverTarget === 'relief'
            ? 'border-primary bg-primary/20 text-foreground'
            : 'border-border bg-card/85 text-foreground'
        }`}
      >
        <div className="flex items-center gap-2 text-base font-semibold">
          <FolderArchive className="text-primary size-5" />
          <span>{t('projectFile.windowDropTitle')}</span>
        </div>
        <p className="text-muted-foreground text-xs">{t('projectFile.windowDropSubtitle')}</p>
      </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
          <ImageDown className="size-4 text-primary" />
          <span>{t('import.windowDropTitle')}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t('import.windowDropSubtitle')}</p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-3 gap-4 px-6">
        {(['color', 'height', 'opacity'] as const).map((id) => (
          <div
            key={id}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverTarget(id);
            }}
            onDragLeave={() => setHoverTarget(null)}
            onDrop={(e) => void handleDropSlot(id, e)}
            className={`flex h-36 flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              hoverTarget === id
                ? 'border-primary bg-primary/20 text-foreground'
                : 'border-border bg-card/80 text-muted-foreground'
            }`}
          >
            <span className="text-sm font-semibold">{t(`maps.${id}` as const)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
