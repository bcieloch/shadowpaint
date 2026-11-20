import { useState } from 'react';
import { getCalibrationMetrics } from '@/core/units/calibration';
import { useEditorStore } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Switch } from '@/ui/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { useI18n } from '@/ui/hooks/useI18n';
import { LabeledSlider } from '@/ui/widgets/LabeledSlider';

function ColorField() {
  const { t } = useI18n();
  const colorHex = useEditorStore((s) => s.brush.colorHex);
  const setBrushOption = useEditorStore((s) => s.setBrushOption);
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const commitHex = (raw: string) => {
    const cleaned = raw.trim();
    const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
    if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
      setBrushOption('colorHex', withHash.toLowerCase());
    }
    setHexDraft(null);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-normal text-muted-foreground">
        {t('toolOptions.colorValue')}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t('toolOptions.colorValue')}
          data-testid="brush-color-picker"
          value={colorHex}
          onChange={(e) => {
            setHexDraft(null);
            setBrushOption('colorHex', e.target.value);
          }}
          className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <Input
          type="text"
          value={hexDraft ?? colorHex}
          data-testid="brush-color-hex"
          onFocus={() => setHexDraft(colorHex)}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => commitHex(hexDraft ?? colorHex)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitHex(hexDraft ?? colorHex);
            }
          }}
          className="h-7 flex-1 font-mono text-xs uppercase"
        />
      </div>
    </div>
  );
}

export function ToolOptions() {
  const { t } = useI18n();
  const tool = useEditorStore((s) => s.tool);
  const activeMap = useEditorStore((s) => s.activeMap);
  const brush = useEditorStore((s) => s.brush);
  const setBrushOption = useEditorStore((s) => s.setBrushOption);
  const canvas = useProjectStore((s) => s.project.canvas);

  const metrics = getCalibrationMetrics(canvas);
  const pxPerCm = Math.max(0.001, metrics.pxPerCm);
  const maxCm = Math.max(0.5, Number((2000 / pxPerCm).toFixed(2)));
  const minCm = Math.max(0.05, Number((1 / pxPerCm).toFixed(2)));

  const handleSizeUnitChange = (nextUnit: string) => {
    if (nextUnit !== 'px' && nextUnit !== 'cm') return;
    if (nextUnit === brush.sizeUnit) return;
    if (nextUnit === 'cm') {
      const nextCm = Math.max(
        minCm,
        Math.min(maxCm, Number((brush.sizeValue / pxPerCm).toFixed(2))),
      );
      setBrushOption('sizeUnit', 'cm');
      setBrushOption('sizeValue', nextCm);
    } else {
      const nextPx = Math.max(1, Math.min(2000, Math.round(brush.sizeValue * pxPerCm)));
      setBrushOption('sizeUnit', 'px');
      setBrushOption('sizeValue', nextPx);
    }
  };

  return (
    <section className="space-y-3 p-3">
      <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {t('toolOptions.sectionTitle')}
      </h2>

      {(tool === 'brush' || tool === 'eraser') && (
        <div className="space-y-3">
          <LabeledSlider
            label={t('toolOptions.size')}
            headerExtra={
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={brush.sizeUnit}
                onValueChange={handleSizeUnitChange}
              >
                <ToggleGroupItem
                  value="px"
                  data-testid="brush-unit-px"
                  className="h-5 px-1.5 font-mono text-[10px]"
                >
                  {t('toolOptions.unitPx')}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="cm"
                  data-testid="brush-unit-cm"
                  className="h-5 px-1.5 font-mono text-[10px]"
                >
                  {t('toolOptions.unitCm')}
                </ToggleGroupItem>
              </ToggleGroup>
            }
            value={brush.sizeValue}
            min={brush.sizeUnit === 'px' ? 1 : minCm}
            max={brush.sizeUnit === 'px' ? 2000 : maxCm}
            step={brush.sizeUnit === 'px' ? 1 : 0.1}
            decimals={brush.sizeUnit === 'px' ? 0 : 2}
            suffix={brush.sizeUnit}
            onValueChange={(v) => setBrushOption('sizeValue', v)}
          />

          <LabeledSlider
            label={t('toolOptions.hardness')}
            value={Math.round(brush.hardness * 100)}
            min={0}
            max={100}
            step={1}
            decimals={0}
            suffix="%"
            onValueChange={(v) => setBrushOption('hardness', v / 100)}
          />

          <LabeledSlider
            label={t('toolOptions.flow')}
            value={Math.round(brush.flow * 100)}
            min={1}
            max={100}
            step={1}
            decimals={0}
            suffix="%"
            onValueChange={(v) => setBrushOption('flow', v / 100)}
          />

          <LabeledSlider
            label={t('toolOptions.spacing')}
            value={Math.round(brush.spacing * 100)}
            min={5}
            max={100}
            step={1}
            decimals={0}
            suffix="%"
            onValueChange={(v) => setBrushOption('spacing', v / 100)}
          />

          <div className="flex items-center justify-between pt-0.5">
            <Label htmlFor="brush-pressure" className="text-xs font-normal text-muted-foreground">
              {t('toolOptions.pressure')}
            </Label>
            <Switch
              id="brush-pressure"
              checked={brush.usePressure}
              onCheckedChange={(checked) => setBrushOption('usePressure', checked)}
            />
          </div>

          {tool === 'brush' && activeMap === 'color' && <ColorField />}

          {tool === 'brush' && (activeMap === 'height' || activeMap === 'opacity') && (
            <div className="space-y-3 border-t border-border pt-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{t('toolOptions.mode')}</span>
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={brush.mode}
                  onValueChange={(v) => {
                    if (v === 'set' || v === 'raise' || v === 'lower') {
                      setBrushOption('mode', v);
                    }
                  }}
                >
                  <ToggleGroupItem
                    value="set"
                    data-testid="brush-mode-set"
                    className="h-6 px-2 text-[11px]"
                  >
                    {t('toolOptions.modeSet')}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="raise"
                    data-testid="brush-mode-raise"
                    className="h-6 px-2 text-[11px]"
                  >
                    {t('toolOptions.modeRaise')}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="lower"
                    data-testid="brush-mode-lower"
                    className="h-6 px-2 text-[11px]"
                  >
                    {t('toolOptions.modeLower')}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {brush.mode === 'set' && activeMap === 'height' && (
                <LabeledSlider
                  label={t('toolOptions.heightValue')}
                  value={Math.max(
                    canvas.minThicknessMm,
                    Math.min(canvas.maxThicknessMm, brush.heightMm),
                  )}
                  min={canvas.minThicknessMm}
                  max={canvas.maxThicknessMm}
                  step={0.05}
                  decimals={2}
                  suffix="mm"
                  onValueChange={(v) => setBrushOption('heightMm', v)}
                />
              )}

              {brush.mode === 'set' && activeMap === 'opacity' && (
                <LabeledSlider
                  label={t('toolOptions.opacityValue')}
                  value={brush.opacityPct}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  suffix="%"
                  onValueChange={(v) => setBrushOption('opacityPct', v)}
                />
              )}
            </div>
          )}

          {tool === 'eraser' && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('toolOptions.eraserHint')}
            </p>
          )}
        </div>
      )}

      {tool === 'eyedropper' && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="leading-relaxed">{t('toolOptions.eyedropperHint')}</p>
          <p className="font-mono text-[11px] text-foreground">
            {activeMap === 'color'
              ? t('toolOptions.sampledColor', { hex: brush.colorHex.toUpperCase() })
              : activeMap === 'height'
                ? t('toolOptions.sampledHeight', { mm: brush.heightMm.toFixed(2) })
                : t('toolOptions.sampledOpacity', { pct: brush.opacityPct.toFixed(1) })}
          </p>
        </div>
      )}

      {tool === 'pan' && (
        <p className="text-xs leading-relaxed text-muted-foreground">{t('toolOptions.panHint')}</p>
      )}
    </section>
  );
}
