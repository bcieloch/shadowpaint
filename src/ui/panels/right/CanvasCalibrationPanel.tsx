import { useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  CM_PER_INCH,
  MAX_CANVAS_CM,
  MAX_MEGAPIXELS_WARNING,
  MAX_PROJECT_PX,
  MAX_RELIEF_MULTIPLIER,
  MAX_THICKNESS_MM,
  MIN_CANVAS_CM,
  MIN_PROJECT_PX,
  MIN_RELIEF_MULTIPLIER,
  MIN_THICKNESS_MM,
} from '@/core/constants';
import { MapRegistry } from '@/core/maps/MapRegistry';
import type { CanvasSettings, MeshDetail, View3DSettings } from '@/core/types';
import {
  computeHeightFromWidthPx,
  computeMeshSegments,
  computeWidthFromHeightPx,
  getCalibrationMetrics,
  validateCanvasSettings,
  type CanvasValidationError,
} from '@/core/units/calibration';
import { getMaxTextureSize } from '@/lib/webgl';
import { recordSettingsPatchHistory } from '@/services/historyService';
import { updateCanvasWithoutResample } from '@/services/projectService';
import { useProjectStore } from '@/state/projectStore';
import { Button } from '@/ui/components/ui/button';
import { Checkbox } from '@/ui/components/ui/checkbox';
import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { Separator } from '@/ui/components/ui/separator';
import { ResizeProjectDialog } from '@/ui/dialogs/ResizeProjectDialog';
import { useI18n } from '@/ui/hooks/useI18n';
import { LabeledSlider } from '@/ui/widgets/LabeledSlider';
import { UnitNumberField } from '@/ui/widgets/UnitNumberField';

const MESH_DETAILS: readonly MeshDetail[] = [256, 512, 1024, 2048];

interface DimensionsDraft {
  baseSignature: string;
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
}

interface ThicknessDraft {
  baseSignature: string;
  minThicknessMm: number;
  maxThicknessMm: number;
}

export function CanvasCalibrationPanel() {
  const { t } = useI18n();
  const canvas = useProjectStore((s) => s.project.canvas);
  const view3d = useProjectStore((s) => s.project.view3d);
  const updateProject = useProjectStore((s) => s.updateProject);

  const maxTextureSize = useMemo(() => getMaxTextureSize(), []);
  const maxPxAllowed = Math.min(maxTextureSize, MAX_PROJECT_PX);

  const dimSignature = `${canvas.widthCm}:${canvas.heightCm}:${canvas.widthPx}:${canvas.heightPx}`;
  const thicknessSignature = `${canvas.minThicknessMm}:${canvas.maxThicknessMm}`;

  const [dimDraft, setDimDraft] = useState<DimensionsDraft | null>(null);
  const [thicknessDraft, setThicknessDraft] = useState<ThicknessDraft | null>(null);
  const [lockAspect, setLockAspect] = useState(true);
  const [lockedAspectRatio, setLockedAspectRatio] = useState(
    () => canvas.widthCm / Math.max(1e-3, canvas.heightCm),
  );
  const [resizeDialogOpen, setResizeDialogOpen] = useState(false);

  const pendingView3dBeforeRef = useRef<View3DSettings | null>(null);

  const activeDims =
    dimDraft && dimDraft.baseSignature === dimSignature
      ? dimDraft
      : {
          widthCm: canvas.widthCm,
          heightCm: canvas.heightCm,
          widthPx: canvas.widthPx,
          heightPx: canvas.heightPx,
        };

  const activeThickness =
    thicknessDraft && thicknessDraft.baseSignature === thicknessSignature
      ? thicknessDraft
      : {
          minThicknessMm: canvas.minThicknessMm,
          maxThicknessMm: canvas.maxThicknessMm,
        };

  const { widthCm, heightCm, widthPx, heightPx } = activeDims;
  const { minThicknessMm, maxThicknessMm } = activeThickness;

  const updateDimensions = (patch: Partial<Omit<DimensionsDraft, 'baseSignature'>>) => {
    setDimDraft({
      baseSignature: dimSignature,
      widthCm: patch.widthCm ?? widthCm,
      heightCm: patch.heightCm ?? heightCm,
      widthPx: patch.widthPx ?? widthPx,
      heightPx: patch.heightPx ?? heightPx,
    });
  };

  const updateThickness = (patch: Partial<Omit<ThicknessDraft, 'baseSignature'>>) => {
    setThicknessDraft({
      baseSignature: thicknessSignature,
      minThicknessMm: patch.minThicknessMm ?? minThicknessMm,
      maxThicknessMm: patch.maxThicknessMm ?? maxThicknessMm,
    });
  };

  const candidateCanvas: CanvasSettings = useMemo(
    () => ({
      widthCm,
      heightCm,
      widthPx,
      heightPx,
      minThicknessMm,
      maxThicknessMm,
    }),
    [widthCm, heightCm, widthPx, heightPx, minThicknessMm, maxThicknessMm],
  );

  const validationErrors = useMemo(
    () => validateCanvasSettings(candidateCanvas, maxTextureSize),
    [candidateCanvas, maxTextureSize],
  );

  const metrics = useMemo(() => getCalibrationMetrics(candidateCanvas), [candidateCanvas]);
  const meshStats = useMemo(
    () => computeMeshSegments(canvas.widthCm, canvas.heightCm, view3d.meshDetail),
    [canvas.widthCm, canvas.heightCm, view3d.meshDetail],
  );

  const pixelCount = candidateCanvas.widthPx * candidateCanvas.heightPx;
  const megapixels = pixelCount / 1_000_000;
  const estimatedMb = Math.round(
    MapRegistry.estimateBytes(candidateCanvas.widthPx, candidateCanvas.heightPx) / (1024 * 1024),
  );
  const showMemoryWarning = pixelCount > MAX_MEGAPIXELS_WARNING;

  const pxChanged = widthPx !== canvas.widthPx || heightPx !== canvas.heightPx;
  const cmChanged = widthCm !== canvas.widthCm || heightCm !== canvas.heightCm;
  const hasDimensionChanges = pxChanged || cmChanged;

  const formatValidationError = (err: CanvasValidationError): string => {
    switch (err) {
      case 'invalidWidthCm':
        return t('validation.invalidWidthCm');
      case 'invalidHeightCm':
        return t('validation.invalidHeightCm');
      case 'invalidWidthPx':
        return t('validation.invalidWidthPx', { max: maxPxAllowed });
      case 'invalidHeightPx':
        return t('validation.invalidHeightPx', { max: maxPxAllowed });
      case 'invalidThicknessRange':
        return t('validation.invalidThicknessRange');
      case 'aspectMismatch':
        return t('validation.aspectMismatch');
    }
  };

  const currentAspect =
    dimDraft && dimDraft.baseSignature === dimSignature
      ? lockedAspectRatio
      : canvas.widthCm / Math.max(1e-3, canvas.heightCm);

  const handleWidthCmChange = (nextW: number) => {
    if (!Number.isFinite(nextW) || nextW <= 0) {
      updateDimensions({ widthCm: nextW });
      return;
    }

    if (lockAspect && currentAspect > 0) {
      const nextH = Number((nextW / currentAspect).toFixed(2));
      setLockedAspectRatio(currentAspect);
      updateDimensions({ widthCm: nextW, heightCm: nextH });
    } else if (heightCm > 0) {
      setLockedAspectRatio(nextW / heightCm);
      updateDimensions({
        widthCm: nextW,
        heightPx: computeHeightFromWidthPx(widthPx, nextW, heightCm),
      });
    }
  };

  const handleHeightCmChange = (nextH: number) => {
    if (!Number.isFinite(nextH) || nextH <= 0) {
      updateDimensions({ heightCm: nextH });
      return;
    }

    if (lockAspect && currentAspect > 0) {
      const nextW = Number((nextH * currentAspect).toFixed(2));
      setLockedAspectRatio(currentAspect);
      updateDimensions({ widthCm: nextW, heightCm: nextH });
    } else if (widthCm > 0) {
      setLockedAspectRatio(widthCm / nextH);
      updateDimensions({
        heightCm: nextH,
        heightPx: computeHeightFromWidthPx(widthPx, widthCm, nextH),
      });
    }
  };

  const handleWidthPxChange = (nextWPx: number) => {
    const cleanW = Math.max(MIN_PROJECT_PX, Math.round(nextWPx));
    updateDimensions({
      widthPx: cleanW,
      heightPx: computeHeightFromWidthPx(cleanW, widthCm, heightCm),
    });
  };

  const handleHeightPxChange = (nextHPx: number) => {
    const cleanH = Math.max(MIN_PROJECT_PX, Math.round(nextHPx));
    updateDimensions({
      widthPx: computeWidthFromHeightPx(cleanH, widthCm, heightCm),
      heightPx: cleanH,
    });
  };

  const handlePxPerCmChange = (nextPxPerCm: number) => {
    if (!Number.isFinite(nextPxPerCm) || nextPxPerCm <= 0) return;
    const cleanW = Math.max(MIN_PROJECT_PX, Math.round(widthCm * nextPxPerCm));
    updateDimensions({
      widthPx: cleanW,
      heightPx: computeHeightFromWidthPx(cleanW, widthCm, heightCm),
    });
  };

  const handleDpiChange = (nextDpi: number) => {
    if (!Number.isFinite(nextDpi) || nextDpi <= 0) return;
    const nextPxPerCm = nextDpi / CM_PER_INCH;
    const cleanW = Math.max(MIN_PROJECT_PX, Math.round(widthCm * nextPxPerCm));
    updateDimensions({
      widthPx: cleanW,
      heightPx: computeHeightFromWidthPx(cleanW, widthCm, heightCm),
    });
  };

  const handleResetDimensions = () => {
    setDimDraft(null);
    setLockedAspectRatio(canvas.widthCm / Math.max(1e-3, canvas.heightCm));
  };

  const handleApplyDimensions = () => {
    if (validationErrors.length > 0 || !hasDimensionChanges) return;
    if (pxChanged) {
      setResizeDialogOpen(true);
      return;
    }

    const result = updateCanvasWithoutResample(candidateCanvas, maxTextureSize);
    if (result.ok) {
      setDimDraft(null);
      const m = getCalibrationMetrics(candidateCanvas);
      toast.success(
        t('canvas.dimensionsUpdatedToast', {
          wCm: candidateCanvas.widthCm,
          hCm: candidateCanvas.heightCm,
          pxPerCm: m.pxPerCm.toFixed(1),
        }),
      );
    }
  };

  const commitThicknessRange = (nextMin: number, nextMax: number) => {
    if (
      !Number.isFinite(nextMin) ||
      !Number.isFinite(nextMax) ||
      nextMin < MIN_THICKNESS_MM ||
      nextMax > MAX_THICKNESS_MM ||
      nextMin >= nextMax
    ) {
      return;
    }
    const res = updateCanvasWithoutResample(
      {
        ...canvas,
        minThicknessMm: nextMin,
        maxThicknessMm: nextMax,
      },
      maxTextureSize,
    );
    if (res.ok) {
      setThicknessDraft(null);
    }
  };

  const thicknessInvalid =
    !Number.isFinite(minThicknessMm) ||
    !Number.isFinite(maxThicknessMm) ||
    minThicknessMm < MIN_THICKNESS_MM ||
    maxThicknessMm > MAX_THICKNESS_MM ||
    minThicknessMm >= maxThicknessMm;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-xs font-semibold">{t('canvas.dimensionsTitle')}</h3>
          {hasDimensionChanges && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={handleResetDimensions}
              data-testid="canvas-reset-dimensions"
            >
              {t('common.reset')}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <UnitNumberField
            id="canvas-width-cm"
            testId="canvas-width-cm"
            label={t('canvas.widthCm')}
            value={widthCm}
            min={MIN_CANVAS_CM}
            max={MAX_CANVAS_CM}
            step={0.5}
            decimals={2}
            suffix="cm"
            onValueChange={handleWidthCmChange}
          />
          <UnitNumberField
            id="canvas-height-cm"
            testId="canvas-height-cm"
            label={t('canvas.heightCm')}
            value={heightCm}
            min={MIN_CANVAS_CM}
            max={MAX_CANVAS_CM}
            step={0.5}
            decimals={2}
            suffix="cm"
            onValueChange={handleHeightCmChange}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="canvas-lock-aspect"
            data-testid="canvas-lock-aspect"
            checked={lockAspect}
            onCheckedChange={(v) => {
              const locked = v === true;
              setLockAspect(locked);
              if (locked && widthCm > 0 && heightCm > 0) {
                setLockedAspectRatio(widthCm / heightCm);
              }
            }}
          />
          <Label htmlFor="canvas-lock-aspect" className="text-xs font-normal">
            {t('canvas.lockAspect')}
          </Label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <UnitNumberField
            id="canvas-width-px"
            testId="canvas-width-px"
            label={t('canvas.widthPx')}
            value={widthPx}
            min={MIN_PROJECT_PX}
            max={maxPxAllowed}
            step={10}
            integer
            suffix="px"
            onValueChange={handleWidthPxChange}
          />
          <UnitNumberField
            id="canvas-height-px"
            testId="canvas-height-px"
            label={t('canvas.heightPx')}
            value={heightPx}
            min={MIN_PROJECT_PX}
            max={maxPxAllowed}
            step={10}
            integer
            suffix="px"
            onValueChange={handleHeightPxChange}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <UnitNumberField
            id="canvas-px-cm"
            testId="canvas-px-cm"
            label={t('canvas.pxPerCm')}
            value={metrics.pxPerCm}
            min={1}
            max={1000}
            step={1}
            decimals={1}
            suffix="px/cm"
            onValueChange={handlePxPerCmChange}
          />
          <UnitNumberField
            id="canvas-dpi"
            testId="canvas-dpi"
            label={t('canvas.dpi')}
            value={metrics.dpi}
            min={1}
            max={2540}
            step={5}
            decimals={1}
            suffix="DPI"
            onValueChange={handleDpiChange}
          />
        </div>

        <div
          className="border-border bg-background/70 text-muted-foreground rounded-md border p-2 font-mono text-[11px]"
          data-testid="canvas-metrics-summary"
        >
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

        <p className="text-muted-foreground text-[11px] leading-snug">
          {pxChanged ? t('canvas.resampleHint') : t('canvas.noResampleHint')}
        </p>

        {showMemoryWarning && (
          <div className="border-primary/40 bg-primary/10 text-primary flex items-start gap-2 rounded-md border p-2 text-[11px]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
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
            className="border-destructive/40 bg-destructive/10 text-destructive space-y-1 rounded-md border p-2 text-[11px]"
            data-testid="canvas-validation-errors"
          >
            {validationErrors.map((err) => (
              <div key={err}>{formatValidationError(err)}</div>
            ))}
          </div>
        )}

        <Button
          type="button"
          size="sm"
          variant={hasDimensionChanges ? 'default' : 'secondary'}
          className="w-full"
          disabled={!hasDimensionChanges || validationErrors.length > 0}
          onClick={handleApplyDimensions}
          data-testid="btn-apply-canvas-resize"
        >
          {!pxChanged && cmChanged
            ? t('canvas.applyDimensionsButton')
            : t('canvas.applyResizeButton')}
        </Button>
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-foreground text-xs font-semibold">{t('canvas.thicknessTitle')}</h3>
        <div className="grid grid-cols-2 gap-2.5">
          <UnitNumberField
            id="canvas-min-mm"
            testId="canvas-min-mm"
            label={t('canvas.minThicknessMm')}
            value={minThicknessMm}
            min={MIN_THICKNESS_MM}
            max={MAX_THICKNESS_MM}
            step={0.1}
            decimals={2}
            suffix="mm"
            onValueChange={(v) => updateThickness({ minThicknessMm: v })}
            onValueCommit={(v) => commitThicknessRange(v, maxThicknessMm)}
          />
          <UnitNumberField
            id="canvas-max-mm"
            testId="canvas-max-mm"
            label={t('canvas.maxThicknessMm')}
            value={maxThicknessMm}
            min={MIN_THICKNESS_MM}
            max={MAX_THICKNESS_MM}
            step={0.1}
            decimals={2}
            suffix="mm"
            onValueChange={(v) => updateThickness({ maxThicknessMm: v })}
            onValueCommit={(v) => commitThicknessRange(minThicknessMm, v)}
          />
        </div>
        {thicknessInvalid && (
          <div
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-2 text-[11px]"
            data-testid="canvas-thickness-error"
          >
            {t('validation.invalidThicknessRange')}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-foreground text-xs font-semibold">{t('canvas.view3dTitle')}</h3>

        <LabeledSlider
          label={t('canvas.reliefMultiplier')}
          value={view3d.reliefMultiplier}
          min={MIN_RELIEF_MULTIPLIER}
          max={MAX_RELIEF_MULTIPLIER}
          step={1}
          suffix="×"
          onValueChange={(v) => {
            if (!pendingView3dBeforeRef.current) {
              pendingView3dBeforeRef.current = { ...useProjectStore.getState().project.view3d };
            }
            updateProject((d) => {
              d.view3d.reliefMultiplier = v;
            });
          }}
          onValueCommit={() => {
            const before = pendingView3dBeforeRef.current;
            pendingView3dBeforeRef.current = null;
            if (!before) return;
            recordSettingsPatchHistory('settingsChange', {
              path: 'view3d',
              before,
              after: { ...useProjectStore.getState().project.view3d },
            });
          }}
        />

        <div className="space-y-1.5">
          <Label htmlFor="canvas-mesh-detail" className="text-muted-foreground text-xs font-normal">
            {t('canvas.meshDetail')}
          </Label>
          <Select
            value={String(view3d.meshDetail)}
            onValueChange={(val) => {
              const nextDetail = Number(val) as MeshDetail;
              if (!MESH_DETAILS.includes(nextDetail)) return;
              if (nextDetail === 2048 && maxTextureSize < 8192) return;
              const before = { ...useProjectStore.getState().project.view3d };
              updateProject((d) => {
                d.view3d.meshDetail = nextDetail;
              });
              recordSettingsPatchHistory('settingsChange', {
                path: 'view3d',
                before,
                after: { ...useProjectStore.getState().project.view3d },
              });
            }}
          >
            <SelectTrigger
              id="canvas-mesh-detail"
              data-testid="canvas-mesh-detail"
              className="h-7 font-mono text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESH_DETAILS.map((detail) => {
                const disabled = detail === 2048 && maxTextureSize < 8192;
                const segs = computeMeshSegments(canvas.widthCm, canvas.heightCm, detail);
                return (
                  <SelectItem key={detail} value={String(detail)} disabled={disabled}>
                    {detail} ({segs.segX}×{segs.segY})
                    {disabled ? ` — ${t('canvas.meshDetailHighDisabled')}` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div
            className="text-muted-foreground font-mono text-[11px]"
            data-testid="canvas-mesh-stats"
          >
            {t('canvas.meshStats', {
              segX: meshStats.segX,
              segY: meshStats.segY,
              vertices: meshStats.vertices.toLocaleString('en-US'),
            })}
          </div>
        </div>
      </div>

      <ResizeProjectDialog
        open={resizeDialogOpen}
        onOpenChange={setResizeDialogOpen}
        currentCanvas={canvas}
        targetCanvas={candidateCanvas}
        onSuccess={() => setDimDraft(null)}
      />
    </div>
  );
}
