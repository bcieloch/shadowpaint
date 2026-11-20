import { useRef, useState } from 'react';
import { ArrowLeftRight, Crop, FlipHorizontal2, FlipVertical2, RotateCw, Trash2, Upload } from 'lucide-react';
import type { FitMode, ImportTransform, MapId } from '@/core/types';
import type { ImportSlotDraft } from '@/services/importService';
import { Button } from '@/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';
import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { TransformEditor } from '@/ui/dialogs/ImportWizard/TransformEditor';
import { useI18n } from '@/ui/hooks/useI18n';

interface SlotCardProps {
  mapId: MapId;
  slot: ImportSlotDraft | null;
  targetWidthPx: number;
  targetHeightPx: number;
  onSelectFile: (mapId: MapId, file: File) => void;
  onChangeFit: (mapId: MapId, fit: FitMode) => void;
  onChangeTransform: (mapId: MapId, transform: ImportTransform) => void;
  onSwapWith: (other: MapId) => void;
  onClear: (mapId: MapId) => void;
}

const OTHER_MAPS: Record<MapId, MapId[]> = {
  color: ['height', 'opacity'],
  height: ['color', 'opacity'],
  opacity: ['color', 'height'],
};

export function SlotCard({
  mapId,
  slot,
  targetWidthPx,
  targetHeightPx,
  onSelectFile,
  onChangeFit,
  onChangeTransform,
  onSwapWith,
  onClear,
}: SlotCardProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editingTransform, setEditingTransform] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const mapTitle = t(`maps.${mapId}` as const);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      onSelectFile(mapId, file);
    }
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
        dragOver ? 'border-primary bg-primary/10' : 'border-border bg-background/50'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      data-testid={`import-slot-${mapId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{mapTitle}</span>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" title={t('import.swapWith')}>
                <ArrowLeftRight className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {OTHER_MAPS[mapId].map((other) => (
                <DropdownMenuItem key={other} onClick={() => onSwapWith(other)}>
                  {t(`maps.${other}` as const)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {slot && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setEditingTransform(false);
                onClear(mapId);
              }}
              title={t('common.clear')}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.tif,.tiff,image/png,image/jpeg,image/tiff"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelectFile(mapId, file);
          e.target.value = '';
        }}
      />

      {!slot ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-36 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground"
        >
          <Upload className="size-5" />
          <span>{t('import.chooseFile')}</span>
          <span className="text-[11px] opacity-75">{t('import.dropToSlot')}</span>
        </button>
      ) : editingTransform ? (
        <TransformEditor
          slot={slot}
          targetWidthPx={targetWidthPx}
          targetHeightPx={targetHeightPx}
          onChange={(next) => onChangeTransform(mapId, next)}
          onDone={() => setEditingTransform(false)}
        />
      ) : (
        <>
          <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-md border border-border bg-black/50">
            <img
              src={slot.thumbDataUrl}
              alt={slot.fileName}
              className="max-h-full max-w-full object-contain"
            />
          </div>

          <div className="space-y-0.5 text-[11px]">
            <div className="truncate font-medium text-foreground" title={slot.fileName}>
              {slot.fileName}
            </div>
            <div className="font-mono text-muted-foreground">
              {slot.decoded.format.toUpperCase()} · {slot.decoded.width}×{slot.decoded.height} px ·{' '}
              {slot.decoded.bitDepth}-bit
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">{t('import.fitMode')}</Label>
            <Select value={slot.fit} onValueChange={(v) => onChangeFit(mapId, v as FitMode)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fit">{t('import.fitContain')}</SelectItem>
                <SelectItem value="fill">{t('import.fitCover')}</SelectItem>
                <SelectItem value="stretch">{t('import.fitStretch')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-1 pt-1">
            <Button
              type="button"
              variant={slot.transform.flipH ? 'secondary' : 'outline'}
              size="xs"
              onClick={() =>
                onChangeTransform(mapId, { ...slot.transform, flipH: !slot.transform.flipH })
              }
              title={t('import.flipH')}
            >
              <FlipHorizontal2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant={slot.transform.flipV ? 'secondary' : 'outline'}
              size="xs"
              onClick={() =>
                onChangeTransform(mapId, { ...slot.transform, flipV: !slot.transform.flipV })
              }
              title={t('import.flipV')}
            >
              <FlipVertical2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() =>
                onChangeTransform(mapId, {
                  ...slot.transform,
                  rotate90: ((slot.transform.rotate90 + 1) % 4) as 0 | 1 | 2 | 3,
                })
              }
              title={t('import.rotate90')}
            >
              <RotateCw className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="gap-1"
              onClick={() => setEditingTransform(true)}
            >
              <Crop className="size-3" />
              <span>{t('import.editTransform')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => inputRef.current?.click()}
            >
              {t('import.replaceFile')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
