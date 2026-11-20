import { useMemo, useRef, useState } from 'react';
import { Activity, Download, Trash2 } from 'lucide-react';
import {
  crossSectionToCsv,
  interpolateCrossSectionSample,
  sampleCrossSection,
} from '@/core/geometry/crossSection';
import { mapRegistry } from '@/core/maps/MapRegistry';
import { clamp01 } from '@/core/maps/quantize';
import { sanitizeExportSlug, triggerDownload } from '@/lib/download';
import { flushDirtyEffectiveTiles } from '@/services/adjustService';
import { useEditorStore } from '@/state/editorStore';
import { useMapsVersionStore } from '@/state/mapsVersion';
import { useProjectStore } from '@/state/projectStore';
import { Button } from '@/ui/components/ui/button';
import { Label } from '@/ui/components/ui/label';
import { Switch } from '@/ui/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { useI18n } from '@/ui/hooks/useI18n';

const SVG_WIDTH = 300;
const SVG_HEIGHT = 188;
const PAD_LEFT = 36;
const PAD_RIGHT = 28;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PLOT_W = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;
const MAX_SVG_POINTS = 240;

export function CrossSectionPanel() {
  const { t } = useI18n();
  const crossSectionLine = useEditorStore((s) => s.crossSectionLine);
  const hoverT = useEditorStore((s) => s.crossSectionHoverT);
  const setCrossSectionLine = useEditorStore((s) => s.setCrossSectionLine);
  const setCrossSectionHoverT = useEditorStore((s) => s.setCrossSectionHoverT);
  const setTool = useEditorStore((s) => s.setTool);
  const canvas = useProjectStore((s) => s.project.canvas);
  const projectName = useProjectStore((s) => s.project.name);
  const mapsVersion = useMapsVersionStore((s) => s.version);

  const [scaleMode, setScaleMode] = useState<'fit' | 'true'>('fit');
  const [showTransmission, setShowTransmission] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const profile = useMemo(() => {
    void mapsVersion;
    if (!crossSectionLine || !mapRegistry.isAllocated) return null;
    flushDirtyEffectiveTiles('height');
    flushDirtyEffectiveTiles('opacity');
    return sampleCrossSection(
      crossSectionLine,
      mapRegistry.heightMap.effective,
      mapRegistry.opacity.effective,
      canvas,
    );
  }, [crossSectionLine, canvas, mapsVersion]);

  const chart = useMemo(() => {
    if (!profile) return null;

    const totalCm = Math.max(1e-4, profile.totalLengthCm);
    const minMm = profile.minThicknessMm;
    const maxMm = profile.maxThicknessMm;
    const rangeMm = Math.max(0.05, maxMm - minMm);

    let xSpanPx = PLOT_W;
    let xToSvg: (cm: number) => number;
    let yToSvg: (mm: number) => number;
    let effectiveTopMm = maxMm;

    if (scaleMode === 'true') {
      // 1 mm Y = 0.1 cm X = 1 mm X physically
      const lengthMm = totalCm * 10;
      const scalePxPerMm = Math.min(PLOT_W / Math.max(0.1, lengthMm), PLOT_H / rangeMm);
      xSpanPx = Math.max(4, lengthMm * scalePxPerMm);
      xToSvg = (cm: number) => PAD_LEFT + cm * 10 * scalePxPerMm;
      yToSvg = (mm: number) => PAD_TOP + PLOT_H - (mm - minMm) * scalePxPerMm;
      effectiveTopMm = minMm + PLOT_H / Math.max(1e-6, scalePxPerMm);
    } else {
      xToSvg = (cm: number) => PAD_LEFT + (cm / totalCm) * PLOT_W;
      yToSvg = (mm: number) => PAD_TOP + PLOT_H - ((mm - minMm) / rangeMm) * PLOT_H;
    }

    const trToSvg = (pct: number) => PAD_TOP + PLOT_H - (clamp01(pct / 100) * PLOT_H);

    const n = profile.sampleCount;
    const step = n > MAX_SVG_POINTS ? (n - 1) / (MAX_SVG_POINTS - 1) : 1;
    const count = n > MAX_SVG_POINTS ? MAX_SVG_POINTS : n;

    const heightCoords: string[] = [];
    const areaCoords: string[] = [];
    const trCoords: string[] = [];

    for (let k = 0; k < count; k++) {
      const idx = Math.min(n - 1, Math.round(k * step));
      const x = xToSvg(profile.distanceCm[idx] ?? 0);
      const yH = yToSvg(profile.thicknessMm[idx] ?? minMm);
      const yTr = trToSvg(profile.transmissionPct[idx] ?? 0);
      const cmd = k === 0 ? 'M' : 'L';
      heightCoords.push(`${cmd}${x.toFixed(2)},${yH.toFixed(2)}`);
      areaCoords.push(`${cmd}${x.toFixed(2)},${yH.toFixed(2)}`);
      trCoords.push(`${cmd}${x.toFixed(2)},${yTr.toFixed(2)}`);
    }

    const baseY = yToSvg(minMm).toFixed(2);
    const endX = xToSvg(profile.totalLengthCm).toFixed(2);
    const startX = PAD_LEFT.toFixed(2);
    const areaPath = `${areaCoords.join(' ')} L${endX},${baseY} L${startX},${baseY} Z`;

    return {
      xSpanPx,
      xToSvg,
      yToSvg,
      trToSvg,
      heightPath: heightCoords.join(' '),
      areaPath,
      transmissionPath: trCoords.join(' '),
      effectiveTopMm,
    };
  }, [profile, scaleMode]);

  const hoverSample = useMemo(() => {
    if (!profile || hoverT === null) return null;
    return interpolateCrossSectionSample(profile, hoverT);
  }, [profile, hoverT]);

  const handleSvgPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!svgRef.current || !chart) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const nextT = clamp01((svgX - PAD_LEFT) / Math.max(1, chart.xSpanPx));
    setCrossSectionHoverT(nextT);
  };

  const handleDownloadCsv = () => {
    if (!profile) return;
    const csv = crossSectionToCsv(profile);
    const slug = sanitizeExportSlug(projectName);
    triggerDownload(csv, 'text/csv;charset=utf-8', `${slug}_cross_section.csv`);
  };

  if (!profile || !chart) {
    return (
      <div className="space-y-3" data-testid="cross-section-empty">
        <div className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('section.title')}
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">{t('section.emptyHint')}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="btn-activate-cross-section"
          onClick={() => setTool('crossSection')}
          className="h-7 w-full gap-1.5 text-xs"
        >
          <Activity className="size-3.5" />
          {t('section.activateTool')}
        </Button>
      </div>
    );
  }

  const hoverX = hoverSample ? chart.xToSvg(hoverSample.distanceCm) : 0;
  const hoverYHeight = hoverSample ? chart.yToSvg(hoverSample.thicknessMm) : 0;
  const hoverYTr = hoverSample ? chart.trToSvg(hoverSample.transmissionPct) : 0;

  return (
    <div className="space-y-3.5" data-testid="cross-section-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground text-xs font-semibold tracking-wide uppercase">
          {t('section.title')}
        </span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={scaleMode}
          onValueChange={(val) => {
            if (val === 'fit' || val === 'true') {
              setScaleMode(val);
            }
          }}
        >
          <ToggleGroupItem
            value="fit"
            data-testid="section-scale-fit"
            className="h-6 px-2 text-[11px]"
          >
            {t('section.scaleFit')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="true"
            data-testid="section-scale-true"
            className="h-6 px-2 text-[11px]"
          >
            {t('section.scaleTrue')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="border-border bg-background/80 rounded-md border p-1.5">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          data-testid="cross-section-svg"
          className="block h-auto w-full select-none"
        >
          {/* Plot grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = PAD_TOP + PLOT_H * (1 - frac);
            return (
              <line
                key={frac}
                x1={PAD_LEFT}
                y1={y}
                x2={PAD_LEFT + PLOT_W}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}

          {/* Baseline & axes */}
          <line
            x1={PAD_LEFT}
            y1={PAD_TOP}
            x2={PAD_LEFT}
            y2={PAD_TOP + PLOT_H}
            stroke="rgba(161,161,170,0.45)"
            strokeWidth="1"
          />
          <line
            x1={PAD_LEFT}
            y1={PAD_TOP + PLOT_H}
            x2={PAD_LEFT + PLOT_W}
            y2={PAD_TOP + PLOT_H}
            stroke="rgba(161,161,170,0.45)"
            strokeWidth="1"
          />

          {/* Y axis labels (mm) */}
          <text
            x={PAD_LEFT - 4}
            y={PAD_TOP + PLOT_H + 3}
            fill="#a1a1aa"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="end"
          >
            {profile.minThicknessMm.toFixed(1)}
          </text>
          <text
            x={PAD_LEFT - 4}
            y={PAD_TOP + 6}
            fill="#f59e0b"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="end"
          >
            {(scaleMode === 'true' ? chart.effectiveTopMm : profile.maxThicknessMm).toFixed(1)}
          </text>
          <text
            x={4}
            y={PAD_TOP + PLOT_H / 2}
            fill="#a1a1aa"
            fontSize="8"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="middle"
            transform={`rotate(-90 4 ${PAD_TOP + PLOT_H / 2})`}
          >
            mm
          </text>

          {/* Right Y axis labels (%) */}
          {showTransmission && (
            <>
              <text
                x={PAD_LEFT + PLOT_W + 4}
                y={PAD_TOP + PLOT_H + 3}
                fill="#38bdf8"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="start"
              >
                0%
              </text>
              <text
                x={PAD_LEFT + PLOT_W + 4}
                y={PAD_TOP + 6}
                fill="#38bdf8"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="start"
              >
                100%
              </text>
            </>
          )}

          {/* X axis labels (cm) */}
          <text
            x={PAD_LEFT}
            y={SVG_HEIGHT - 6}
            fill="#a1a1aa"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="start"
          >
            0 cm
          </text>
          <text
            x={PAD_LEFT + chart.xSpanPx / 2}
            y={SVG_HEIGHT - 6}
            fill="#a1a1aa"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="middle"
          >
            {(profile.totalLengthCm / 2).toFixed(1)}
          </text>
          <text
            x={PAD_LEFT + chart.xSpanPx}
            y={SVG_HEIGHT - 6}
            fill="#e4e4e7"
            fontSize="8.5"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="end"
          >
            {profile.totalLengthCm.toFixed(2)} cm
          </text>

          {/* Paint relief area + thickness curve */}
          <path d={chart.areaPath} fill="rgba(245, 158, 11, 0.22)" />
          <path
            d={chart.heightPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.75"
            strokeLinejoin="round"
            data-testid="section-height-path"
          />

          {/* Secondary transmission % trace */}
          {showTransmission && (
            <path
              d={chart.transmissionPath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.25"
              strokeDasharray="3 2"
              strokeLinejoin="round"
              data-testid="section-transmission-path"
            />
          )}

          {/* Hover cursor crosshair and markers */}
          {hoverSample && (
            <g data-testid="section-svg-hover-marker">
              <line
                x1={hoverX}
                y1={PAD_TOP}
                x2={hoverX}
                y2={PAD_TOP + PLOT_H}
                stroke="rgba(228, 228, 231, 0.55)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle cx={hoverX} cy={hoverYHeight} r="3.5" fill="#f59e0b" stroke="#0b0b0d" />
              {showTransmission && (
                <circle cx={hoverX} cy={hoverYTr} r="3" fill="#38bdf8" stroke="#0b0b0d" />
              )}
            </g>
          )}

          {/* Interactive hover surface */}
          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={Math.max(1, chart.xSpanPx)}
            height={PLOT_H}
            fill="transparent"
            data-testid="section-hover-surface"
            className="cursor-crosshair"
            onPointerMove={handleSvgPointerMove}
            onPointerLeave={() => setCrossSectionHoverT(null)}
          />
        </svg>

        <div
          data-testid="section-hover-readout"
          className="text-muted-foreground border-border/60 mt-1 flex min-h-5 items-center justify-between border-t pt-1 font-mono text-[10px]"
        >
          {hoverSample ? (
            <>
              <span>d {hoverSample.distanceCm.toFixed(2)} cm</span>
              <span className="text-amber-400">{hoverSample.thicknessMm.toFixed(3)} mm</span>
              <span className="text-sky-400">T {hoverSample.transmissionPct.toFixed(1)}%</span>
            </>
          ) : (
            <span className="font-sans text-[11px]">{t('section.hoverHint')}</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label
          htmlFor="section-show-transmission"
          className="text-muted-foreground text-xs font-normal"
        >
          {t('section.showTransmission')}
        </Label>
        <Switch
          id="section-show-transmission"
          data-testid="section-toggle-transmission"
          checked={showTransmission}
          onCheckedChange={setShowTransmission}
        />
      </div>

      <div
        data-testid="section-stats"
        className="border-border bg-background/50 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md border p-2.5 text-[11px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('section.statLength')}</span>
          <span className="font-mono">{profile.stats.totalLengthCm.toFixed(2)} cm</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('section.statMin')}</span>
          <span className="font-mono">{profile.stats.minMm.toFixed(2)} mm</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('section.statMax')}</span>
          <span className="font-mono">{profile.stats.maxMm.toFixed(2)} mm</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t('section.statMean')}</span>
          <span className="font-mono">{profile.stats.meanMm.toFixed(2)} mm</span>
        </div>
        <div className="col-span-2 flex items-center justify-between border-t border-white/10 pt-1">
          <span className="text-muted-foreground">{t('section.statTransmissionMean')}</span>
          <span className="font-mono text-sky-400">
            {profile.stats.meanTransmissionPct.toFixed(1)} %
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="btn-section-csv"
          onClick={handleDownloadCsv}
          className="h-7 flex-1 gap-1.5 text-xs"
        >
          <Download className="size-3.5" />
          {t('section.exportCsv')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="btn-section-clear"
          onClick={() => setCrossSectionLine(null)}
          className="h-7 gap-1.5 text-xs"
        >
          <Trash2 className="size-3.5" />
          {t('section.clear')}
        </Button>
      </div>
    </div>
  );
}
