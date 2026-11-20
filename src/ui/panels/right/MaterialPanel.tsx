import { useMemo, useRef, useState } from 'react';
import {
  MATERIAL_PRESETS,
  type MaterialPresetId,
  MAX_CANVAS_TRANSMITTANCE,
  MAX_K_TINT,
  MAX_MU_A,
  MAX_MU_S,
  MAX_ROUGHNESS,
  MAX_SCATTER_RADIUS_MM,
  MIN_CANVAS_TRANSMITTANCE,
  MIN_K_TINT,
  MIN_MU_A,
  MIN_MU_S,
  MIN_ROUGHNESS,
  MIN_SCATTER_RADIUS_MM,
} from '@/core/constants';
import { applyMaterialPreset, sampleTransmissionCurve } from '@/core/optics/beerLambert';
import type { MaterialSettings } from '@/core/types';
import { hexToRgb01 } from '@/core/units/colorTemperature';
import { recordSettingsPatchHistory } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { Separator } from '@/ui/components/ui/separator';
import { useI18n } from '@/ui/hooks/useI18n';
import { ColorField } from '@/ui/widgets/ColorField';
import { LabeledSlider } from '@/ui/widgets/LabeledSlider';

const CHART_W = 240;
const CHART_H = 112;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 20;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

const PRESET_IDS: readonly MaterialPresetId[] = [
  'custom',
  ...MATERIAL_PRESETS.map((p) => p.id),
];

function isValidPresetId(value: string): value is MaterialPresetId {
  return (PRESET_IDS as readonly string[]).includes(value);
}

function presetLabelKey(id: MaterialPresetId) {
  switch (id) {
    case 'acrylicOpaque':
      return 'material.presetAcrylicOpaque' as const;
    case 'acrylicGlaze':
      return 'material.presetAcrylicGlaze' as const;
    case 'oilImpasto':
      return 'material.presetOilImpasto' as const;
    case 'clearGel':
      return 'material.presetClearGel' as const;
    case 'modelingPaste':
      return 'material.presetModelingPaste' as const;
    default:
      return 'material.presetCustom' as const;
  }
}

export function MaterialPanel() {
  const { t } = useI18n();
  const material = useProjectStore((s) => s.project.material);
  const canvas = useProjectStore((s) => s.project.canvas);
  const backLighting = useProjectStore((s) => s.project.lighting.back);
  const brushColor = useEditorStore((s) => s.brush.colorHex);
  const updateProject = useProjectStore((s) => s.updateProject);
  const pendingBeforeRef = useRef<MaterialSettings | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const previewMaterial = (mutate: (draft: MaterialSettings) => void) => {
    if (!pendingBeforeRef.current) {
      pendingBeforeRef.current = { ...useProjectStore.getState().project.material };
    }
    updateProject((projectDraft) => {
      mutate(projectDraft.material);
    }, true);
  };

  const commitMaterial = () => {
    const before = pendingBeforeRef.current;
    pendingBeforeRef.current = null;
    if (!before) return;
    const after = { ...useProjectStore.getState().project.material };
    recordSettingsPatchHistory('settingsChange', {
      path: 'material',
      before,
      after,
    });
  };

  const selectPreset = (value: string) => {
    if (!isValidPresetId(value)) return;
    const before = { ...useProjectStore.getState().project.material };
    pendingBeforeRef.current = null;
    const next = applyMaterialPreset(before, value);
    updateProject((projectDraft) => {
      projectDraft.material = next;
    }, true);
    recordSettingsPatchHistory('settingsChange', {
      path: 'material',
      before,
      after: next,
    });
  };

  const activePresetValue: MaterialPresetId = isValidPresetId(material.preset)
    ? material.preset
    : 'custom';

  // If the current brush color is near pure white, compare against dark pigment so tint absorption remains legible.
  const tintHex = useMemo(() => {
    const rgb = hexToRgb01(brushColor);
    const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    return lum > 0.9 ? '#333333' : brushColor;
  }, [brushColor]);

  const curve = useMemo(
    () =>
      sampleTransmissionCurve({
        maxThicknessMm: canvas.maxThicknessMm,
        material,
        globalTransmissionPct: backLighting.globalTransmissionPct,
        attenuation: backLighting.attenuation,
        tintHex,
        opacityTau: 1,
        steps: 41,
      }),
    [
      canvas.maxThicknessMm,
      material,
      backLighting.globalTransmissionPct,
      backLighting.attenuation,
      tintHex,
    ],
  );

  const maxMm = Math.max(0.01, canvas.maxThicknessMm);
  const yMaxPct = Math.max(100, Math.ceil(backLighting.globalTransmissionPct));
  const yMidPct = yMaxPct / 2;

  const toX = (dMm: number) => PAD_L + (dMm / maxMm) * PLOT_W;
  const toY = (pct: number) =>
    PAD_T + (1 - Math.min(yMaxPct, Math.max(0, pct)) / yMaxPct) * PLOT_H;

  const whitePathD = useMemo(
    () =>
      curve
        .map((pt, i) => {
          const x = PAD_L + (pt.dMm / maxMm) * PLOT_W;
          const y = PAD_T + (1 - Math.min(yMaxPct, Math.max(0, pt.whiteTotalPct)) / yMaxPct) * PLOT_H;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' '),
    [curve, maxMm, yMaxPct],
  );

  const tintPathD = useMemo(
    () =>
      curve
        .map((pt, i) => {
          const x = PAD_L + (pt.dMm / maxMm) * PLOT_W;
          const y = PAD_T + (1 - Math.min(yMaxPct, Math.max(0, pt.tintTotalPct)) / yMaxPct) * PLOT_H;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' '),
    [curve, maxMm, yMaxPct],
  );

  const firstSample = curve[0];
  const lastSample = curve[curve.length - 1];
  const hoveredSample = hoverIdx !== null ? (curve[hoverIdx] ?? null) : null;

  const handleSvgPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(t * (curve.length - 1));
    setHoverIdx(idx);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('material.opticsTitle')}
        </div>

        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-normal">
            {t('material.preset')}
          </Label>
          <Select value={activePresetValue} onValueChange={selectPreset}>
            <SelectTrigger className="h-8 text-xs" data-testid="material-preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESET_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {t(presetLabelKey(id))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <LabeledSlider
          label={t('material.roughness')}
          value={material.roughness}
          min={MIN_ROUGHNESS}
          max={MAX_ROUGHNESS}
          step={0.01}
          decimals={2}
          testId="material-roughness"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.preset = 'custom';
              d.roughness = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.muA')}
          value={material.muA}
          min={MIN_MU_A}
          max={MAX_MU_A}
          step={0.05}
          decimals={2}
          suffix="/mm"
          testId="material-mu-a"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.preset = 'custom';
              d.muA = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.muS')}
          value={material.muS}
          min={MIN_MU_S}
          max={MAX_MU_S}
          step={0.05}
          decimals={2}
          suffix="/mm"
          testId="material-mu-s"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.preset = 'custom';
              d.muS = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.kTint')}
          value={material.kTint}
          min={MIN_K_TINT}
          max={MAX_K_TINT}
          step={0.01}
          decimals={2}
          testId="material-k-tint"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.preset = 'custom';
              d.kTint = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.scatterRadius')}
          value={material.scatterRadiusMm}
          min={MIN_SCATTER_RADIUS_MM}
          max={MAX_SCATTER_RADIUS_MM}
          step={0.1}
          decimals={2}
          suffix="mm"
          testId="material-scatter-radius"
          onValueChange={(v) =>
            previewMaterial((d) => {
              d.preset = 'custom';
              d.scatterRadiusMm = v;
            })
          }
          onValueCommit={commitMaterial}
        />

        <LabeledSlider
          label={t('material.canvasTransmittance')}
          value={Math.round(material.canvasTransmittance * 100)}
          min={MIN_CANVAS_TRANSMITTANCE * 100}
          max={MAX_CANVAS_TRANSMITTANCE * 100}
          step={1}
          decimals={0}
          suffix="%"
          testId="material-canvas-transmittance"
          onValueChange={(pct) =>
            previewMaterial((d) => {
              d.canvasTransmittance = Number((pct / 100).toFixed(2));
            })
          }
          onValueCommit={commitMaterial}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground text-xs font-semibold tracking-wide uppercase">
            {t('material.curveTitle')}
          </span>
          {firstSample && lastSample && (
            <span
              data-testid="material-td-summary"
              className="text-muted-foreground font-mono text-[10px]"
            >
              {t('material.curveSummary', {
                t0: firstSample.whiteTotalPct.toFixed(0),
                tmax: lastSample.whiteTotalPct.toFixed(1),
              })}
            </span>
          )}
        </div>

        <svg
          data-testid="material-td-chart"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="border-border bg-background/60 w-full rounded border"
          role="img"
          aria-label={t('material.curveTitle')}
        >
          {/* Horizontal percentage grid */}
          {[0, yMidPct, yMaxPct].map((pct) => {
            const yPos = toY(pct);
            return (
              <g key={pct}>
                <line
                  x1={PAD_L}
                  y1={yPos}
                  x2={PAD_L + PLOT_W}
                  y2={yPos}
                  stroke="#27272a"
                  strokeWidth="0.75"
                  strokeDasharray={pct === 0 ? undefined : '2 2'}
                />
                <text
                  x={PAD_L - 3}
                  y={yPos + 3}
                  textAnchor="end"
                  fill="#a1a1aa"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {pct.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H} stroke="#52525b" strokeWidth="1" />
          <line
            x1={PAD_L}
            y1={PAD_T + PLOT_H}
            x2={PAD_L + PLOT_W}
            y2={PAD_T + PLOT_H}
            stroke="#52525b"
            strokeWidth="1"
          />

          {/* X-axis min/max mm labels */}
          <text
            x={PAD_L}
            y={CHART_H - 5}
            textAnchor="start"
            fill="#a1a1aa"
            fontSize="8"
            fontFamily="monospace"
          >
            0 mm
          </text>
          <text
            x={PAD_L + PLOT_W / 2}
            y={CHART_H - 5}
            textAnchor="middle"
            fill="#a1a1aa"
            fontSize="8"
            fontFamily="monospace"
          >
            {(maxMm / 2).toFixed(1)} mm
          </text>
          <text
            x={PAD_L + PLOT_W}
            y={CHART_H - 5}
            textAnchor="end"
            fill="#a1a1aa"
            fontSize="8"
            fontFamily="monospace"
          >
            {maxMm.toFixed(1)} mm
          </text>

          {/* T(d) curves */}
          <path
            data-testid="material-td-white-path"
            d={whitePathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.75"
          />
          <path
            data-testid="material-td-brush-path"
            d={tintPathD}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.25"
            strokeDasharray="3 2"
          />

          {hoveredSample && (
            <g>
              <line
                x1={toX(hoveredSample.dMm)}
                y1={PAD_T}
                x2={toX(hoveredSample.dMm)}
                y2={PAD_T + PLOT_H}
                stroke="#e4e4e7"
                strokeWidth="0.75"
                strokeDasharray="2 2"
              />
              <circle
                cx={toX(hoveredSample.dMm)}
                cy={toY(hoveredSample.whiteTotalPct)}
                r="2.8"
                fill="#38bdf8"
                stroke="#09090b"
                strokeWidth="0.75"
              />
              <circle
                cx={toX(hoveredSample.dMm)}
                cy={toY(hoveredSample.tintTotalPct)}
                r="2.4"
                fill="#f59e0b"
                stroke="#09090b"
                strokeWidth="0.75"
              />
            </g>
          )}

          {/* Hover capture surface */}
          <rect
            data-testid="material-td-hover-surface"
            x={PAD_L}
            y={PAD_T}
            width={PLOT_W}
            height={PLOT_H}
            fill="transparent"
            onPointerMove={handleSvgPointerMove}
            onPointerLeave={() => setHoverIdx(null)}
          />
        </svg>

        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-sky-400" aria-hidden="true" />
            {t('material.curveWhiteLegend')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-3 border-b border-dashed border-amber-400"
              aria-hidden="true"
            />
            {t('material.curveTintLegend')}
          </span>
        </div>

        {hoveredSample && (
          <div
            data-testid="material-td-readout"
            className="text-foreground/90 bg-muted/40 rounded px-2 py-1 font-mono text-[10px]"
          >
            {t('material.curveHoverReadout', {
              mm: hoveredSample.dMm.toFixed(2),
              whitePct: hoveredSample.whiteTotalPct.toFixed(1),
              tintPct: hoveredSample.tintTotalPct.toFixed(1),
            })}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2.5">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('material.canvasBackTitle')}
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs font-normal">
            {t('material.canvasBackColor')}
          </Label>
          <ColorField
            value={material.canvasBackColor}
            pickerTestId="material-back-color-picker"
            hexTestId="material-back-color-hex"
            onValueChange={(hex) =>
              previewMaterial((d) => {
                d.canvasBackColor = hex;
              })
            }
            onValueCommit={commitMaterial}
          />
        </div>
      </div>

      <p className="text-muted-foreground text-[11px] leading-relaxed">
        {t('material.opticsNote')}
      </p>
    </div>
  );
}
