import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  CANVAS_PRESETS,
  CM_PER_INCH,
  MAX_MEGAPIXELS_WARNING,
  MAX_PROJECT_PX,
  MIN_PROJECT_PX,
} from '@/core/constants';
import { MapRegistry } from '@/core/maps/MapRegistry';
import type { CanvasSettings } from '@/core/types';
import {
  computeHeightFromWidthPx,
  getCalibrationMetrics,
  validateCanvasSettings,
  type CanvasValidationError,
} from '@/core/units/calibration';
import { getMaxTextureSize } from '@/lib/webgl';
import { createAndActivateProject } from '@/services/projectService';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
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
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { useI18n } from '@/ui/hooks/useI18n';

type ResolutionInputMode = 'pxPerCm' | 'dpi' | 'widthPx';

interface NewProjectFormProps {
  onClose: () => void;
}

function NewProjectForm({ onClose }: NewProjectFormProps) {
  const { t } = useI18n();
  const isDirty = useProjectStore((s) => s.isDirty);

  const [name, setName] = useState(() => t('app.untitledProject'));
  const [preset, setPreset] = useState('50x70');
  const [widthCm, setWidthCm] = useState(50);
  const [heightCm, setHeightCm] = useState(70);
  const [lockAspect, setLockAspect] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(50 / 70);
  const [resMode, setResMode] = useState<ResolutionInputMode>('pxPerCm');
  const [pxPerCmInput, setPxPerCmInput] = useState(60);
  const [dpiInput, setDpiInput] = useState(152.4);
  const [widthPxInput, setWidthPxInput] = useState(3000);
  const [minThicknessMm, setMinThicknessMm] = useState(0);
  const [maxThicknessMm, setMaxThicknessMm] = useState(5);
  const [discardConfirmed, setDiscardConfirmed] = useState(false);

  const maxTextureSize = useMemo(() => getMaxTextureSize(), []);

  const computedDimensions = useMemo(() => {
    const safeW = Number.isFinite(widthCm) && widthCm > 0 ? widthCm : 50;
    const safeH = Number.isFinite(heightCm) && heightCm > 0 ? heightCm : 70;
    let wPx: number;
    if (resMode === 'pxPerCm') {
      wPx = Math.round(safeW * pxPerCmInput);
    } else if (resMode === 'dpi') {
      wPx = Math.round((safeW * dpiInput) / CM_PER_INCH);
    } else {
      wPx = Math.round(widthPxInput);
    }
    wPx = Math.max(MIN_PROJECT_PX, Number.isFinite(wPx) ? wPx : MIN_PROJECT_PX);
    const hPx = computeHeightFromWidthPx(wPx, safeW, safeH);
    return { wPx, hPx };
  }, [widthCm, heightCm, resMode, pxPerCmInput, dpiInput, widthPxInput]);

  const candidateCanvas: CanvasSettings = useMemo(
    () => ({
      widthCm,
      heightCm,
      widthPx: computedDimensions.wPx,
      heightPx: computedDimensions.hPx,
      minThicknessMm,
      maxThicknessMm,
    }),
    [widthCm, heightCm, computedDimensions, minThicknessMm, maxThicknessMm],
  );

  const validationErrors = useMemo(
    () => validateCanvasSettings(candidateCanvas, maxTextureSize),
    [candidateCanvas, maxTextureSize],
  );

  const metrics = useMemo(() => getCalibrationMetrics(candidateCanvas), [candidateCanvas]);
  const pixelCount = candidateCanvas.widthPx * candidateCanvas.heightPx;
  const megapixels = pixelCount / 1_000_000;
  const estimatedMb = Math.round(
    MapRegistry.estimateBytes(candidateCanvas.widthPx, candidateCanvas.heightPx) / (1024 * 1024),
  );
  const showMemoryWarning = pixelCount > MAX_MEGAPIXELS_WARNING;

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const found = CANVAS_PRESETS.find((p) => p.id === value);
    if (found) {
      setWidthCm(found.widthCm);
      setHeightCm(found.heightCm);
      setAspectRatio(found.widthCm / found.heightCm);
    }
  };

  const handleWidthCmChange = (next: number) => {
    setPreset('custom');
    setWidthCm(next);
    if (lockAspect && Number.isFinite(next) && next > 0 && aspectRatio > 0) {
      setHeightCm(Number((next / aspectRatio).toFixed(2)));
    } else if (Number.isFinite(next) && next > 0 && heightCm > 0) {
      setAspectRatio(next / heightCm);
    }
  };

  const handleHeightCmChange = (next: number) => {
    setPreset('custom');
    setHeightCm(next);
    if (lockAspect && Number.isFinite(next) && next > 0 && aspectRatio > 0) {
      setWidthCm(Number((next * aspectRatio).toFixed(2)));
    } else if (Number.isFinite(next) && next > 0 && widthCm > 0) {
      setAspectRatio(widthCm / next);
    }
  };

  const formatValidationError = (err: CanvasValidationError): string => {
    switch (err) {
      case 'invalidWidthCm':
        return t('validation.invalidWidthCm');
      case 'invalidHeightCm':
        return t('validation.invalidHeightCm');
      case 'invalidWidthPx':
        return t('validation.invalidWidthPx', { max: maxTextureSize });
      case 'invalidHeightPx':
        return t('validation.invalidHeightPx', { max: maxTextureSize });
      case 'invalidThicknessRange':
        return t('validation.invalidThicknessRange');
      case 'aspectMismatch':
        return t('validation.aspectMismatch');
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationErrors.length > 0) return;
    if (isDirty && !discardConfirmed) return;

    const trimmedName = name.trim() || t('app.untitledProject');
    const result = createAndActivateProject({
      name: trimmedName,
      canvas: candidateCanvas,
    });

    if (!result.ok) {
      toast.error(t('newProject.outOfMemoryError', { mb: result.requiredMb }));
      return;
    }

    toast.success(
      t('newProject.createdToast', {
        name: trimmedName,
        wCm: candidateCanvas.widthCm,
        hCm: candidateCanvas.heightCm,
        wPx: candidateCanvas.widthPx,
        hPx: candidateCanvas.heightPx,
      }),
    );
    onClose();
  };

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="np-name">{t('newProject.projectName')}</Label>
          <Input
            id="np-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="np-preset">{t('newProject.preset')}</Label>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger id="np-preset" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANVAS_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.id} ({t('newProject.presetFormat', { width: p.widthCm, height: p.heightCm })})
                </SelectItem>
              ))}
              <SelectItem value="custom">{t('newProject.presetCustom')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="np-width-cm">{t('newProject.widthCm')}</Label>
          <Input
            id="np-width-cm"
            type="number"
            step="0.1"
            min={1}
            max={1000}
            value={widthCm}
            onChange={(e) => handleWidthCmChange(parseFloat(e.target.value))}
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np-height-cm">{t('newProject.heightCm')}</Label>
          <Input
            id="np-height-cm"
            type="number"
            step="0.1"
            min={1}
            max={1000}
            value={heightCm}
            onChange={(e) => handleHeightCmChange(parseFloat(e.target.value))}
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="np-lock-aspect"
          checked={lockAspect}
          onCheckedChange={(v) => {
            const locked = v === true;
            setLockAspect(locked);
            if (locked && widthCm > 0 && heightCm > 0) {
              setAspectRatio(widthCm / heightCm);
            }
          }}
        />
        <Label htmlFor="np-lock-aspect" className="text-xs font-normal">
          {t('newProject.lockAspect')}
        </Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="np-res-mode">{t('newProject.resolutionMode')}</Label>
          <Select value={resMode} onValueChange={(v) => setResMode(v as ResolutionInputMode)}>
            <SelectTrigger id="np-res-mode" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pxPerCm">{t('newProject.modePxPerCm')}</SelectItem>
              <SelectItem value="dpi">{t('newProject.modeDpi')}</SelectItem>
              <SelectItem value="widthPx">{t('newProject.modeWidthPx')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {resMode === 'pxPerCm' && (
          <div className="space-y-1.5">
            <Label htmlFor="np-px-cm">{t('newProject.pxPerCm')}</Label>
            <Input
              id="np-px-cm"
              type="number"
              step="1"
              min={1}
              max={500}
              value={pxPerCmInput}
              onChange={(e) => setPxPerCmInput(parseFloat(e.target.value) || 1)}
              className="h-8 font-mono text-xs"
            />
          </div>
        )}

        {resMode === 'dpi' && (
          <div className="space-y-1.5">
            <Label htmlFor="np-dpi">{t('newProject.dpi')}</Label>
            <Input
              id="np-dpi"
              type="number"
              step="1"
              min={10}
              max={1200}
              value={dpiInput}
              onChange={(e) => setDpiInput(parseFloat(e.target.value) || 72)}
              className="h-8 font-mono text-xs"
            />
          </div>
        )}

        {resMode === 'widthPx' && (
          <div className="space-y-1.5">
            <Label htmlFor="np-width-px">{t('newProject.widthPx')}</Label>
            <Input
              id="np-width-px"
              type="number"
              step="1"
              min={16}
              max={MAX_PROJECT_PX}
              value={widthPxInput}
              onChange={(e) => setWidthPxInput(parseInt(e.target.value, 10) || 16)}
              className="h-8 font-mono text-xs"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="np-min-mm">{t('newProject.minThicknessMm')}</Label>
          <Input
            id="np-min-mm"
            type="number"
            step="0.1"
            min={0}
            max={50}
            value={minThicknessMm}
            onChange={(e) => setMinThicknessMm(parseFloat(e.target.value))}
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np-max-mm">{t('newProject.maxThicknessMm')}</Label>
          <Input
            id="np-max-mm"
            type="number"
            step="0.1"
            min={0.1}
            max={50}
            value={maxThicknessMm}
            onChange={(e) => setMaxThicknessMm(parseFloat(e.target.value))}
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-background/70 p-2.5 text-xs">
        <div className="mb-1 font-medium text-foreground">{t('newProject.summaryTitle')}</div>
        <div className="font-mono text-muted-foreground">
          <div>
            {t('newProject.summaryDimensions', {
              wPx: candidateCanvas.widthPx,
              hPx: candidateCanvas.heightPx,
              mp: megapixels.toFixed(2),
            })}
          </div>
          <div>
            {t('newProject.summaryDensity', {
              pxPerCm: metrics.pxPerCm.toFixed(1),
              dpi: metrics.dpi.toFixed(1),
            })}
          </div>
          <div>{t('newProject.summaryMemory', { mb: estimatedMb })}</div>
        </div>
      </div>

      {showMemoryWarning && (
        <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-2.5 text-xs text-primary">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {t('newProject.highMemoryWarning', {
              mp: megapixels.toFixed(1),
              mb: estimatedMb,
            })}
          </span>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div
          className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
          data-testid="new-project-errors"
        >
          {validationErrors.map((err) => (
            <div key={err}>{formatValidationError(err)}</div>
          ))}
        </div>
      )}

      {isDirty && (
        <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-2.5 text-xs">
          <Checkbox
            id="np-confirm-discard"
            checked={discardConfirmed}
            onCheckedChange={(v) => setDiscardConfirmed(v === true)}
          />
          <Label htmlFor="np-confirm-discard" className="text-xs font-normal leading-snug">
            {t('newProject.unsavedConfirm')}
          </Label>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={validationErrors.length > 0 || (isDirty && !discardConfirmed)}
          data-testid="new-project-submit"
        >
          {t('common.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NewProjectDialog() {
  const { t } = useI18n();
  const open = useUiStore((s) => s.dialogs.newProjectOpen);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);

  return (
    <Dialog open={open} onOpenChange={(v) => setDialogOpen('newProjectOpen', v)}>
      <DialogContent className="max-w-lg bg-card text-foreground">
        <DialogHeader>
          <DialogTitle>{t('newProject.title')}</DialogTitle>
          <DialogDescription>{t('newProject.description')}</DialogDescription>
        </DialogHeader>
        {open && <NewProjectForm onClose={() => setDialogOpen('newProjectOpen', false)} />}
      </DialogContent>
    </Dialog>
  );
}
