import { useEffect, useState } from 'react';
import { ImageDown } from 'lucide-react';
import { toast } from 'sonner';
import type { MapId } from '@/core/types';
import { classifyDecodeError, decodeFileToSlot } from '@/services/importService';
import { useUiStore } from '@/state/uiStore';
import { useI18n } from '@/ui/hooks/useI18n';

export function WindowDropOverlay() {
  const { t } = useI18n();
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);
  const [active, setActive] = useState(false);
  const [hoverSlot, setHoverSlot] = useState<MapId | null>(null);

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
        setHoverSlot(null);
      }
    };
    const onDrop = (e: DragEvent) => {
      dragDepth = 0;
      setActive(false);
      setHoverSlot(null);
      if (hasFiles(e)) {
        e.preventDefault();
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
    setHoverSlot(null);
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/85 backdrop-blur-xs">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 text-base font-semibold text-foreground">
          <ImageDown className="size-5 text-primary" />
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
              setHoverSlot(id);
            }}
            onDragLeave={() => setHoverSlot(null)}
            onDrop={(e) => handleDropSlot(id, e)}
            className={`flex h-36 flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              hoverSlot === id
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
