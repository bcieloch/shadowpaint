import { useCallback, useEffect, useState } from 'react';
import { Activity, Cpu, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  getDiagnosticsSnapshot,
  optimizeQualityForGpu,
  type DiagnosticsSnapshot,
} from '@/services/diagnosticsService';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/ui/popover';
import { Separator } from '@/ui/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';

function formatMs(val: number | null | undefined, fallback: string): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return fallback;
  return `${val.toFixed(1)} ms`;
}

export function PerformanceDiagnosticsPopover() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);

  const refresh = useCallback(() => {
    setSnapshot(getDiagnosticsSnapshot());
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        refresh();
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(refresh, 500);
    return () => {
      window.clearInterval(id);
    };
  }, [open, refresh]);

  const handleOptimize = () => {
    const preset = optimizeQualityForGpu();
    refresh();
    toast.success(
      t('diagnostics.optimizedToast', {
        meshDetail: String(preset.meshDetail),
        shadowSize: String(preset.shadowMapSize),
      }),
    );
  };

  const gpu = snapshot?.gpu;
  const engine = snapshot?.engine;
  const workers = snapshot?.workers;
  const timings = snapshot?.adjustTimingsMs;
  const na = t('diagnostics.notMeasured');

  const colorTiming = timings?.color ?? workers?.lastDurationsMs.computeEffectiveColor ?? null;
  const heightTiming = timings?.height ?? workers?.lastDurationsMs.computeEffectiveHeight ?? null;
  const opacityTiming =
    timings?.opacity ?? workers?.lastDurationsMs.computeEffectiveOpacity ?? null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="gap-1 px-2"
              aria-label={t('topbar.diagnosticsTooltip')}
              data-testid="btn-diagnostics"
            >
              <Activity className="size-3.5" />
              <span className="hidden 2xl:inline">{t('topbar.diagnostics')}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('topbar.diagnosticsTooltip')}</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        className="w-88 space-y-2.5 p-3.5 text-xs"
        data-testid="diagnostics-popover"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-semibold">
            <Cpu className="text-primary size-4" aria-hidden="true" />
            <span>{t('diagnostics.title')}</span>
          </div>
          <div className="flex items-center gap-1">
            {gpu && (
              <Badge
                variant={gpu.isSoftwareRenderer ? 'secondary' : 'outline'}
                className="text-[10px]"
              >
                {gpu.isSoftwareRenderer
                  ? t('diagnostics.gpuModeSoftware')
                  : t('diagnostics.gpuModeHardware')}
              </Badge>
            )}
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="size-6 p-0"
              aria-label={t('diagnostics.refreshTooltip')}
              onClick={refresh}
              data-testid="btn-diagnostics-refresh"
            >
              <RefreshCw className="size-3" />
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-1" data-testid="diag-gpu">
          <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            {t('diagnostics.gpuTitle')}
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <span className="text-muted-foreground">{t('diagnostics.gpuRenderer')}</span>
            <span className="truncate text-right font-mono" title={gpu?.renderer ?? na}>
              {gpu?.renderer ?? na}
            </span>
            <span className="text-muted-foreground">{t('diagnostics.gpuVendor')}</span>
            <span className="truncate text-right font-mono" title={gpu?.vendor ?? na}>
              {gpu?.vendor ?? na}
            </span>
            <span className="text-muted-foreground">{t('diagnostics.gpuMaxTexture')}</span>
            <span className="text-right font-mono">
              {gpu ? `${gpu.maxTextureSize} px` : na}
            </span>
            <span className="text-muted-foreground">{t('diagnostics.gpuWebgl2')}</span>
            <span className="text-right font-mono">
              {gpu
                ? gpu.webgl2
                  ? t('diagnostics.supported')
                  : t('diagnostics.unsupported')
                : na}
            </span>
          </div>
        </div>

        <Separator />

        <div className="space-y-1">
          <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            {t('diagnostics.memoryTitle')}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.geometries')}</span>
              <span className="font-mono font-medium" data-testid="diag-geometries">
                {engine?.memory.geometries ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.textures')}</span>
              <span className="font-mono font-medium" data-testid="diag-textures">
                {engine?.memory.textures ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.programs')}</span>
              <span className="font-mono font-medium" data-testid="diag-programs">
                {engine?.memory.programs ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.drawCalls')}</span>
              <span className="font-mono font-medium">{engine?.render.calls ?? 0}</span>
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.triangles')}</span>
              <span className="font-mono font-medium">
                {(engine?.render.triangles ?? 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-1">
          <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            {t('diagnostics.timingTitle')}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.lastFrameMs')}</span>
              <span className="font-mono">{formatMs(engine?.lastFrameMs, na)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.avgFrameMs')}</span>
              <span className="font-mono">{formatMs(engine?.avgFrameMs, na)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.uploadMs')}</span>
              <span className="font-mono">{formatMs(engine?.lastTextureUploadMs, na)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.workerPool')}</span>
              <span className="font-mono" data-testid="diag-workers">
                {workers ? `${workers.activeWorkers}/${workers.poolSize}` : na}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.workerJobs')}</span>
              <span className="font-mono">
                {workers ? `${workers.totalJobs} (${workers.activeJobs})` : na}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.dirtyTiles')}</span>
              <span className="font-mono">{snapshot?.dirtyTilesCount ?? 0}</span>
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.recomputeColorMs')}</span>
              <span className="font-mono">{formatMs(colorTiming, na)}</span>
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.recomputeHeightMs')}</span>
              <span className="font-mono">{formatMs(heightTiming, na)}</span>
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-muted-foreground">{t('diagnostics.recomputeOpacityMs')}</span>
              <span className="font-mono">{formatMs(opacityTiming, na)}</span>
            </div>
          </div>
        </div>

        <Button
          type="button"
          size="xs"
          variant="outline"
          className="w-full gap-1.5"
          onClick={handleOptimize}
          data-testid="btn-optimize-gpu"
        >
          <Sparkles className="size-3.5" />
          <span>{t('diagnostics.optimizeButton')}</span>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
