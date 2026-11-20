import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColorAdjustments, HeightAdjustments, MapId, OpacityAdjustments } from '@/core/types';
import {
  computeFloatMapStats,
  recomputeEffectiveMap,
  smoothFloatMap,
} from '@/services/adjustService';
import { recordSettingsPatchHistory } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import { useMapsVersionStore } from '@/state/mapsVersion';
import { useProjectStore } from '@/state/projectStore';
import { Button } from '@/ui/components/ui/button';
import { Label } from '@/ui/components/ui/label';
import { Separator } from '@/ui/components/ui/separator';
import { Switch } from '@/ui/components/ui/switch';
import { useI18n } from '@/ui/hooks/useI18n';
import { LabeledSlider } from '@/ui/widgets/LabeledSlider';

type AdjustmentSnapshot =
  | { mapId: 'color'; value: ColorAdjustments }
  | { mapId: 'height'; value: HeightAdjustments }
  | { mapId: 'opacity'; value: OpacityAdjustments };

function cloneAdjustmentSnapshot(mapId: MapId): AdjustmentSnapshot {
  const adjustments = useProjectStore.getState().project.adjustments;
  if (mapId === 'color') {
    return { mapId: 'color', value: { ...adjustments.color } };
  }
  if (mapId === 'height') {
    return { mapId: 'height', value: { ...adjustments.height } };
  }
  return { mapId: 'opacity', value: { ...adjustments.opacity } };
}

function recordAdjustmentDiff(
  action: 'adjustment' | 'resetAdjustments',
  before: AdjustmentSnapshot,
  after: AdjustmentSnapshot,
): void {
  if (before.mapId === 'color' && after.mapId === 'color') {
    recordSettingsPatchHistory(action, {
      path: 'adjustments.color',
      affectedMapId: 'color',
      before: before.value,
      after: after.value,
    });
  } else if (before.mapId === 'height' && after.mapId === 'height') {
    recordSettingsPatchHistory(action, {
      path: 'adjustments.height',
      affectedMapId: 'height',
      before: before.value,
      after: after.value,
    });
  } else if (before.mapId === 'opacity' && after.mapId === 'opacity') {
    recordSettingsPatchHistory(action, {
      path: 'adjustments.opacity',
      affectedMapId: 'opacity',
      before: before.value,
      after: after.value,
    });
  }
}

export function MapParamsPanel() {
  const { t } = useI18n();
  const activeMap = useEditorStore((s) => s.activeMap);
  const adjustments = useProjectStore((s) => s.project.adjustments);
  const updateProject = useProjectStore((s) => s.updateProject);
  const mapVersion = useMapsVersionStore((s) => s.mapVersions[activeMap]);

  const [smoothRadiusPx, setSmoothRadiusPx] = useState(4);
  const [smoothing, setSmoothing] = useState(false);

  const pendingBeforeRef = useRef<AdjustmentSnapshot | null>(null);

  useEffect(() => {
    pendingBeforeRef.current = null;
  }, [activeMap]);

  const ensurePendingSnapshot = (mapId: MapId) => {
    if (!pendingBeforeRef.current || pendingBeforeRef.current.mapId !== mapId) {
      pendingBeforeRef.current = cloneAdjustmentSnapshot(mapId);
    }
  };

  const commitPendingSnapshot = (mapId: MapId) => {
    const before = pendingBeforeRef.current;
    pendingBeforeRef.current = null;
    if (!before || before.mapId !== mapId) return;
    const after = cloneAdjustmentSnapshot(mapId);
    recordAdjustmentDiff('adjustment', before, after);
  };

  const stats = useMemo(() => {
    void mapVersion;
    if (activeMap === 'color') return null;
    return computeFloatMapStats(activeMap);
  }, [activeMap, mapVersion]);

  const handleSmooth = async () => {
    if (activeMap === 'color' || smoothing) return;
    setSmoothing(true);
    try {
      await smoothFloatMap(activeMap, smoothRadiusPx);
    } finally {
      setSmoothing(false);
    }
  };

  if (activeMap === 'color') {
    const c = adjustments.color;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-xs font-semibold">{t('maps.color')}</h3>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              const before = cloneAdjustmentSnapshot('color');
              updateProject((d) => {
                d.adjustments.color = { brightness: 0, contrast: 0, saturation: 0 };
              });
              recordAdjustmentDiff('resetAdjustments', before, cloneAdjustmentSnapshot('color'));
              void recomputeEffectiveMap('color');
            }}
          >
            {t('common.reset')}
          </Button>
        </div>

        <LabeledSlider
          label={t('mapParams.brightness')}
          value={Math.round(c.brightness * 100)}
          min={-100}
          max={100}
          step={1}
          suffix="%"
          onValueChange={(v) => {
            ensurePendingSnapshot('color');
            updateProject((d) => {
              d.adjustments.color.brightness = v / 100;
            });
            void recomputeEffectiveMap('color');
          }}
          onValueCommit={() => commitPendingSnapshot('color')}
        />
        <LabeledSlider
          label={t('mapParams.contrast')}
          value={Math.round(c.contrast * 100)}
          min={-100}
          max={100}
          step={1}
          suffix="%"
          onValueChange={(v) => {
            ensurePendingSnapshot('color');
            updateProject((d) => {
              d.adjustments.color.contrast = v / 100;
            });
            void recomputeEffectiveMap('color');
          }}
          onValueCommit={() => commitPendingSnapshot('color')}
        />
        <LabeledSlider
          label={t('mapParams.saturation')}
          value={Math.round(c.saturation * 100)}
          min={-100}
          max={100}
          step={1}
          suffix="%"
          onValueChange={(v) => {
            ensurePendingSnapshot('color');
            updateProject((d) => {
              d.adjustments.color.saturation = v / 100;
            });
            void recomputeEffectiveMap('color');
          }}
          onValueCommit={() => commitPendingSnapshot('color')}
        />
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          {t('mapParams.colorNote')}
        </p>
      </div>
    );
  }

  if (activeMap === 'height') {
    const h = adjustments.height;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-xs font-semibold">{t('maps.height')}</h3>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              const before = cloneAdjustmentSnapshot('height');
              updateProject((d) => {
                d.adjustments.height = { invert: false, contrast: 0, gamma: 1 };
              });
              recordAdjustmentDiff('resetAdjustments', before, cloneAdjustmentSnapshot('height'));
              void recomputeEffectiveMap('height');
            }}
          >
            {t('common.reset')}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="height-invert" className="text-muted-foreground text-xs font-normal">
            {t('mapParams.invert')}
          </Label>
          <Switch
            id="height-invert"
            checked={h.invert}
            onCheckedChange={(checked) => {
              const before = cloneAdjustmentSnapshot('height');
              updateProject((d) => {
                d.adjustments.height.invert = checked;
              });
              recordAdjustmentDiff('adjustment', before, cloneAdjustmentSnapshot('height'));
              void recomputeEffectiveMap('height');
            }}
          />
        </div>

        <LabeledSlider
          label={t('mapParams.contrast')}
          value={Math.round(h.contrast * 100)}
          min={-100}
          max={100}
          step={1}
          suffix="%"
          onValueChange={(v) => {
            ensurePendingSnapshot('height');
            updateProject((d) => {
              d.adjustments.height.contrast = v / 100;
            });
            void recomputeEffectiveMap('height');
          }}
          onValueCommit={() => commitPendingSnapshot('height')}
        />

        <LabeledSlider
          label={t('mapParams.gamma')}
          value={h.gamma}
          min={0.2}
          max={5}
          step={0.05}
          decimals={2}
          onValueChange={(v) => {
            ensurePendingSnapshot('height');
            updateProject((d) => {
              d.adjustments.height.gamma = v;
            });
            void recomputeEffectiveMap('height');
          }}
          onValueCommit={() => commitPendingSnapshot('height')}
        />

        <Separator />

        <div className="space-y-2">
          <div className="text-foreground text-xs font-medium">{t('mapParams.smoothTitle')}</div>
          <LabeledSlider
            label={t('mapParams.smoothRadiusPx')}
            value={smoothRadiusPx}
            min={1}
            max={50}
            step={1}
            suffix="px"
            onValueChange={setSmoothRadiusPx}
          />
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="w-full"
            disabled={smoothing}
            onClick={handleSmooth}
          >
            {smoothing ? t('common.loading') : t('mapParams.smoothApply')}
          </Button>
        </div>

        {stats && (
          <div className="border-border bg-background/60 rounded border p-2 text-[11px]">
            <div className="text-foreground mb-0.5 font-medium">{t('mapParams.statsTitle')}</div>
            <div className="text-muted-foreground font-mono">
              {t('mapParams.statsRangeMm', {
                min: stats.min.toFixed(2),
                max: stats.max.toFixed(2),
                mean: stats.mean.toFixed(2),
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const o = adjustments.opacity;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground text-xs font-semibold">{t('maps.opacity')}</h3>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => {
            const before = cloneAdjustmentSnapshot('opacity');
            updateProject((d) => {
              d.adjustments.opacity = {
                invert: false,
                contrast: 0,
                maxTransmissionPct: 100,
                maxOpacityPct: 100,
              };
            });
            recordAdjustmentDiff('resetAdjustments', before, cloneAdjustmentSnapshot('opacity'));
            void recomputeEffectiveMap('opacity');
          }}
        >
          {t('common.reset')}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="opacity-invert" className="text-muted-foreground text-xs font-normal">
          {t('mapParams.invert')}
        </Label>
        <Switch
          id="opacity-invert"
          checked={o.invert}
          onCheckedChange={(checked) => {
            const before = cloneAdjustmentSnapshot('opacity');
            updateProject((d) => {
              d.adjustments.opacity.invert = checked;
            });
            recordAdjustmentDiff('adjustment', before, cloneAdjustmentSnapshot('opacity'));
            void recomputeEffectiveMap('opacity');
          }}
        />
      </div>

      <LabeledSlider
        label={t('mapParams.maxTransmission')}
        value={o.maxTransmissionPct}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onValueChange={(v) => {
          ensurePendingSnapshot('opacity');
          updateProject((d) => {
            d.adjustments.opacity.maxTransmissionPct = v;
          });
          void recomputeEffectiveMap('opacity');
        }}
        onValueCommit={() => commitPendingSnapshot('opacity')}
      />

      <LabeledSlider
        label={t('mapParams.maxOpacity')}
        value={o.maxOpacityPct}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onValueChange={(v) => {
          ensurePendingSnapshot('opacity');
          updateProject((d) => {
            d.adjustments.opacity.maxOpacityPct = v;
          });
          void recomputeEffectiveMap('opacity');
        }}
        onValueCommit={() => commitPendingSnapshot('opacity')}
      />

      <LabeledSlider
        label={t('mapParams.contrast')}
        value={Math.round(o.contrast * 100)}
        min={-100}
        max={100}
        step={1}
        suffix="%"
        onValueChange={(v) => {
          ensurePendingSnapshot('opacity');
          updateProject((d) => {
            d.adjustments.opacity.contrast = v / 100;
          });
          void recomputeEffectiveMap('opacity');
        }}
        onValueCommit={() => commitPendingSnapshot('opacity')}
      />

      <Separator />

      <div className="space-y-2">
        <div className="text-foreground text-xs font-medium">{t('mapParams.smoothTitle')}</div>
        <LabeledSlider
          label={t('mapParams.smoothRadiusPx')}
          value={smoothRadiusPx}
          min={1}
          max={50}
          step={1}
          suffix="px"
          onValueChange={setSmoothRadiusPx}
        />
        <Button
          type="button"
          size="xs"
          variant="secondary"
          className="w-full"
          disabled={smoothing}
          onClick={handleSmooth}
        >
          {smoothing ? t('common.loading') : t('mapParams.smoothApply')}
        </Button>
      </div>

      {stats && (
        <div className="border-border bg-background/60 rounded border p-2 text-[11px]">
          <div className="text-foreground mb-0.5 font-medium">{t('mapParams.statsTitle')}</div>
          <div className="text-muted-foreground font-mono">
            {t('mapParams.statsRangePct', {
              min: stats.min.toFixed(1),
              max: stats.max.toFixed(1),
              mean: stats.mean.toFixed(1),
            })}
          </div>
        </div>
      )}
    </div>
  );
}
