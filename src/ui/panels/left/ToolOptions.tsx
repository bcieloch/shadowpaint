import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { brushSizeToPx, getCalibrationMetrics } from '@/core/units/calibration';
import { BLUR_REALTIME_MAX_RADIUS_PX } from '@/editor2d/tools/BlurTool';
import { applyFillSelectionToActiveMap } from '@/services/filterService';
import { useEditorStore } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Switch } from '@/ui/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { useI18n } from '@/ui/hooks/useI18n';
import { SelectionOptions } from '@/ui/panels/left/SelectionOptions';
import { LabeledSlider } from '@/ui/widgets/LabeledSlider';

function HexColorControl({
  label,
  value,
  onChange,
  pickerTestId,
  hexTestId,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  pickerTestId: string;
  hexTestId: string;
}) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const commitHex = (raw: string) => {
    const cleaned = raw.trim();
    const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
    if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
      onChange(withHash.toLowerCase());
    }
    setHexDraft(null);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs font-normal">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          data-testid={pickerTestId}
          value={value}
          onChange={(e) => {
            setHexDraft(null);
            onChange(e.target.value);
          }}
          className="border-border h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input
          type="text"
          value={hexDraft ?? value}
          data-testid={hexTestId}
          onFocus={() => setHexDraft(value)}
          onChange={(e) => setHexDraft(e.target.value)}
          onBlur={() => commitHex(hexDraft ?? value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitHex(hexDraft ?? value);
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
  const smoothTool = useEditorStore((s) => s.smoothTool);
  const blurTool = useEditorStore((s) => s.blurTool);
  const gradientTool = useEditorStore((s) => s.gradientTool);
  const fillTool = useEditorStore((s) => s.fillTool);
  const hasSelection = useEditorStore((s) => s.hasSelection);
  const setBrushOption = useEditorStore((s) => s.setBrushOption);
  const setSmoothToolOption = useEditorStore((s) => s.setSmoothToolOption);
  const setBlurToolOption = useEditorStore((s) => s.setBlurToolOption);
  const setGradientToolOption = useEditorStore((s) => s.setGradientToolOption);
  const setFillToolOption = useEditorStore((s) => s.setFillToolOption);
  const canvas = useProjectStore((s) => s.project.canvas);
  const activeMapLocked = useProjectStore((s) => s.project.maps[activeMap].locked);

  const metrics = getCalibrationMetrics(canvas);
  const pxPerCm = Math.max(0.001, metrics.pxPerCm);
  const maxCm = Math.max(0.5, Number((2000 / pxPerCm).toFixed(2)));
  const minCm = Math.max(0.05, Number((1 / pxPerCm).toFixed(2)));

  const maxBlurCm = Math.max(0.2, Number((100 / pxPerCm).toFixed(2)));
  const minBlurCm = Math.max(0.02, Number((1 / pxPerCm).toFixed(2)));

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

  const handleBlurUnitChange = (nextUnit: string) => {
    if (nextUnit !== 'px' && nextUnit !== 'cm') return;
    if (nextUnit === blurTool.radiusUnit) return;
    if (nextUnit === 'cm') {
      const nextCm = Math.max(
        minBlurCm,
        Math.min(maxBlurCm, Number((blurTool.radiusValue / pxPerCm).toFixed(2))),
      );
      setBlurToolOption('radiusUnit', 'cm');
      setBlurToolOption('radiusValue', nextCm);
    } else {
      const nextPx = Math.max(1, Math.min(100, Math.round(blurTool.radiusValue * pxPerCm)));
      setBlurToolOption('radiusUnit', 'px');
      setBlurToolOption('radiusValue', nextPx);
    }
  };

  const handleSwapGradientEndpoints = () => {
    const {
      startColorHex,
      endColorHex,
      startHeightMm,
      endHeightMm,
      startOpacityPct,
      endOpacityPct,
    } = gradientTool;
    setGradientToolOption('startColorHex', endColorHex);
    setGradientToolOption('endColorHex', startColorHex);
    setGradientToolOption('startHeightMm', endHeightMm);
    setGradientToolOption('endHeightMm', startHeightMm);
    setGradientToolOption('startOpacityPct', endOpacityPct);
    setGradientToolOption('endOpacityPct', startOpacityPct);
  };

  const showBrushSliders =
    tool === 'brush' ||
    tool === 'eraser' ||
    tool === 'smooth' ||
    tool === 'blur' ||
    tool === 'maskBrush';

  const blurKernelRadiusPx = brushSizeToPx(blurTool.radiusValue, blurTool.radiusUnit, pxPerCm);

  return (
    <section className="space-y-3 p-3">
      <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {t('toolOptions.sectionTitle')}
      </h2>

      {showBrushSliders && (
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
            testId="brush-size-input"
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
            <Label htmlFor="brush-pressure" className="text-muted-foreground text-xs font-normal">
              {t('toolOptions.pressure')}
            </Label>
            <Switch
              id="brush-pressure"
              checked={brush.usePressure}
              onCheckedChange={(checked) => setBrushOption('usePressure', checked)}
            />
          </div>

          {tool === 'brush' && activeMap === 'color' && (
            <HexColorControl
              label={t('toolOptions.colorValue')}
              value={brush.colorHex}
              onChange={(hex) => setBrushOption('colorHex', hex)}
              pickerTestId="brush-color-picker"
              hexTestId="brush-color-hex"
            />
          )}

          {tool === 'brush' && (activeMap === 'height' || activeMap === 'opacity') && (
            <div className="border-border space-y-3 border-t pt-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">{t('toolOptions.mode')}</span>
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
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {t('toolOptions.eraserHint')}
            </p>
          )}

          {tool === 'smooth' && (
            <div className="border-border space-y-2.5 border-t pt-2.5">
              <LabeledSlider
                label={t('toolOptions.smoothIterations')}
                value={smoothTool.iterations}
                min={1}
                max={10}
                step={1}
                decimals={0}
                testId="smooth-iterations-input"
                onValueChange={(v) => setSmoothToolOption('iterations', Math.round(v))}
              />
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {t('toolOptions.smoothHint')}
              </p>
            </div>
          )}

          {tool === 'blur' && (
            <div className="border-border space-y-2.5 border-t pt-2.5">
              <LabeledSlider
                label={t('toolOptions.blurRadius')}
                headerExtra={
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={blurTool.radiusUnit}
                    onValueChange={handleBlurUnitChange}
                  >
                    <ToggleGroupItem
                      value="px"
                      data-testid="blur-unit-px"
                      className="h-5 px-1.5 font-mono text-[10px]"
                    >
                      {t('toolOptions.unitPx')}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="cm"
                      data-testid="blur-unit-cm"
                      className="h-5 px-1.5 font-mono text-[10px]"
                    >
                      {t('toolOptions.unitCm')}
                    </ToggleGroupItem>
                  </ToggleGroup>
                }
                value={blurTool.radiusValue}
                min={blurTool.radiusUnit === 'px' ? 1 : minBlurCm}
                max={blurTool.radiusUnit === 'px' ? 100 : maxBlurCm}
                step={blurTool.radiusUnit === 'px' ? 1 : 0.05}
                decimals={blurTool.radiusUnit === 'px' ? 0 : 2}
                suffix={blurTool.radiusUnit}
                testId="blur-radius-input"
                onValueChange={(v) => setBlurToolOption('radiusValue', v)}
              />
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {t('toolOptions.blurHint')}
              </p>
              {blurKernelRadiusPx > BLUR_REALTIME_MAX_RADIUS_PX && (
                <p
                  data-testid="blur-worker-hint"
                  className="text-[11px] leading-relaxed text-amber-400/90"
                >
                  {t('toolOptions.blurWorkerHint')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tool === 'gradient' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">{t('toolOptions.gradientKind')}</span>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={gradientTool.kind}
              onValueChange={(v) => {
                if (v === 'linear' || v === 'radial') {
                  setGradientToolOption('kind', v);
                }
              }}
            >
              <ToggleGroupItem
                value="linear"
                data-testid="gradient-kind-linear"
                className="h-6 px-2 text-[11px]"
              >
                {t('toolOptions.gradientLinear')}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="radial"
                data-testid="gradient-kind-radial"
                className="h-6 px-2 text-[11px]"
              >
                {t('toolOptions.gradientRadial')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {activeMap === 'color' && (
            <div className="space-y-2.5">
              <HexColorControl
                label={t('toolOptions.gradientStartColor')}
                value={gradientTool.startColorHex}
                onChange={(hex) => setGradientToolOption('startColorHex', hex)}
                pickerTestId="gradient-start-color-picker"
                hexTestId="gradient-start-color-hex"
              />
              <HexColorControl
                label={t('toolOptions.gradientEndColor')}
                value={gradientTool.endColorHex}
                onChange={(hex) => setGradientToolOption('endColorHex', hex)}
                pickerTestId="gradient-end-color-picker"
                hexTestId="gradient-end-color-hex"
              />
            </div>
          )}

          {activeMap === 'height' && (
            <div className="space-y-2.5">
              <LabeledSlider
                label={t('toolOptions.gradientStartHeight')}
                value={Math.max(
                  canvas.minThicknessMm,
                  Math.min(canvas.maxThicknessMm, gradientTool.startHeightMm),
                )}
                min={canvas.minThicknessMm}
                max={canvas.maxThicknessMm}
                step={0.05}
                decimals={2}
                suffix="mm"
                testId="gradient-start-height-input"
                onValueChange={(v) => setGradientToolOption('startHeightMm', v)}
              />
              <LabeledSlider
                label={t('toolOptions.gradientEndHeight')}
                value={Math.max(
                  canvas.minThicknessMm,
                  Math.min(canvas.maxThicknessMm, gradientTool.endHeightMm),
                )}
                min={canvas.minThicknessMm}
                max={canvas.maxThicknessMm}
                step={0.05}
                decimals={2}
                suffix="mm"
                testId="gradient-end-height-input"
                onValueChange={(v) => setGradientToolOption('endHeightMm', v)}
              />
            </div>
          )}

          {activeMap === 'opacity' && (
            <div className="space-y-2.5">
              <LabeledSlider
                label={t('toolOptions.gradientStartOpacity')}
                value={gradientTool.startOpacityPct}
                min={0}
                max={100}
                step={1}
                decimals={0}
                suffix="%"
                testId="gradient-start-opacity-input"
                onValueChange={(v) => setGradientToolOption('startOpacityPct', v)}
              />
              <LabeledSlider
                label={t('toolOptions.gradientEndOpacity')}
                value={gradientTool.endOpacityPct}
                min={0}
                max={100}
                step={1}
                decimals={0}
                suffix="%"
                testId="gradient-end-opacity-input"
                onValueChange={(v) => setGradientToolOption('endOpacityPct', v)}
              />
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="gradient-swap-btn"
            onClick={handleSwapGradientEndpoints}
            className="h-7 w-full gap-1.5 text-xs"
          >
            <ArrowLeftRight className="size-3.5" />
            {t('toolOptions.gradientSwap')}
          </Button>

          {hasSelection && (
            <div className="flex items-center justify-between pt-0.5">
              <Label
                htmlFor="gradient-only-selection"
                className="text-muted-foreground text-xs font-normal"
              >
                {t('toolOptions.gradientOnlyInSelection')}
              </Label>
              <Switch
                id="gradient-only-selection"
                data-testid="gradient-only-selection"
                checked={gradientTool.onlyInSelection}
                onCheckedChange={(checked) => setGradientToolOption('onlyInSelection', checked)}
              />
            </div>
          )}

          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {t('toolOptions.gradientHint')}
          </p>
        </div>
      )}

      {tool === 'fill' && (
        <div className="space-y-3">
          <LabeledSlider
            label={t('toolOptions.fillTolerance')}
            value={fillTool.tolerancePct}
            min={0}
            max={100}
            step={1}
            decimals={0}
            suffix="%"
            testId="fill-tolerance-input"
            onValueChange={(v) => setFillToolOption('tolerancePct', Math.round(v))}
          />

          <div className="flex items-center justify-between">
            <Label htmlFor="fill-contiguous" className="text-muted-foreground text-xs font-normal">
              {t('toolOptions.fillContiguous')}
            </Label>
            <Switch
              id="fill-contiguous"
              data-testid="fill-contiguous"
              checked={fillTool.contiguous}
              onCheckedChange={(checked) => setFillToolOption('contiguous', checked)}
            />
          </div>

          {activeMap === 'color' && (
            <HexColorControl
              label={t('toolOptions.colorValue')}
              value={brush.colorHex}
              onChange={(hex) => setBrushOption('colorHex', hex)}
              pickerTestId="brush-color-picker"
              hexTestId="brush-color-hex"
            />
          )}

          {activeMap === 'height' && (
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
              testId="fill-height-input"
              onValueChange={(v) => setBrushOption('heightMm', v)}
            />
          )}

          {activeMap === 'opacity' && (
            <LabeledSlider
              label={t('toolOptions.opacityValue')}
              value={brush.opacityPct}
              min={0}
              max={100}
              step={1}
              decimals={0}
              suffix="%"
              testId="fill-opacity-input"
              onValueChange={(v) => setBrushOption('opacityPct', v)}
            />
          )}

          <Button
            type="button"
            variant="secondary"
            size="xs"
            data-testid="btn-fill-selection"
            disabled={activeMapLocked}
            onClick={() => void applyFillSelectionToActiveMap()}
            className="h-7 w-full text-xs"
          >
            {t('toolOptions.fillSelection')}
          </Button>

          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {t('toolOptions.fillHint')}
          </p>
        </div>
      )}

      {tool === 'eyedropper' && (
        <div className="text-muted-foreground space-y-2 text-xs">
          <p className="leading-relaxed">{t('toolOptions.eyedropperHint')}</p>
          <p className="text-foreground font-mono text-[11px]">
            {activeMap === 'color'
              ? t('toolOptions.sampledColor', { hex: brush.colorHex.toUpperCase() })
              : activeMap === 'height'
                ? t('toolOptions.sampledHeight', { mm: brush.heightMm.toFixed(2) })
                : t('toolOptions.sampledOpacity', { pct: brush.opacityPct.toFixed(1) })}
          </p>
        </div>
      )}

      {tool === 'pan' && (
        <p className="text-muted-foreground text-xs leading-relaxed">{t('toolOptions.panHint')}</p>
      )}

      <SelectionOptions />
    </section>
  );
}
