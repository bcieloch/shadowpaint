import { useState } from 'react';
import {
  clearSelection,
  featherSelection,
  invertSelection,
  selectAllSelection,
  setSelectionProtectMode,
} from '@/services/selectionService';
import { useEditorStore, type ToolId } from '@/state/editorStore';
import { useProjectStore } from '@/state/projectStore';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import { Switch } from '@/ui/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/ui/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';
import { LabeledSlider } from '@/ui/widgets/LabeledSlider';

function isSelectionTool(tool: ToolId): boolean {
  return (
    tool === 'selectRect' ||
    tool === 'selectEllipse' ||
    tool === 'selectLasso' ||
    tool === 'magicWand' ||
    tool === 'maskBrush'
  );
}

export function SelectionOptions() {
  const { t } = useI18n();
  const tool = useEditorStore((s) => s.tool);
  const selectionTools = useEditorStore((s) => s.selectionTools);
  const hasSelection = useEditorStore((s) => s.hasSelection);
  const showMaskOverlay = useEditorStore((s) => s.showMaskOverlay);
  const setSelectionToolOption = useEditorStore((s) => s.setSelectionToolOption);
  const setShowMaskOverlay = useEditorStore((s) => s.setShowMaskOverlay);
  const selectionSettings = useProjectStore((s) => s.project.selection);

  const [featherPx, setFeatherPx] = useState<number>(() =>
    selectionSettings.feather > 0 ? selectionSettings.feather : 4,
  );

  const handleFeatherApply = () => {
    const radius = Math.max(1, Math.min(128, Math.round(featherPx)));
    setFeatherPx(radius);
    void featherSelection(radius);
  };

  if (!isSelectionTool(tool)) {
    if (!hasSelection) return null;
    return (
      <div
        data-testid="selection-active-strip"
        className="border-border bg-muted/30 space-y-2 rounded-md border p-2"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-[11px] font-medium">
            {t('selection.activeStripTitle')}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                data-testid="selection-strip-clear"
                onClick={() => clearSelection()}
                className="h-5 px-1.5 text-[10px]"
              >
                {t('selection.clear')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('selection.clearTooltip')}</TooltipContent>
          </Tooltip>
        </div>

        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={selectionSettings.mode}
          onValueChange={(v) => {
            if (v === 'protect' || v === 'editInside') {
              setSelectionProtectMode(v);
            }
          }}
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem
            value="protect"
            data-testid="selection-mode-protect"
            className="h-6 px-1.5 text-[11px]"
          >
            {t('selection.modeProtect')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="editInside"
            data-testid="selection-mode-editInside"
            className="h-6 px-1.5 text-[11px]"
          >
            {t('selection.modeEditInside')}
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex items-center justify-between">
          <Label htmlFor="selection-strip-overlay" className="text-muted-foreground text-[11px]">
            {t('selection.showOverlay')}
          </Label>
          <Switch
            id="selection-strip-overlay"
            checked={showMaskOverlay}
            onCheckedChange={setShowMaskOverlay}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="text-muted-foreground text-xs">{t('selection.maskEffectLabel')}</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={selectionSettings.mode}
          onValueChange={(v) => {
            if (v === 'protect' || v === 'editInside') {
              setSelectionProtectMode(v);
            }
          }}
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem
            value="protect"
            data-testid="selection-mode-protect"
            className="h-7 px-2 text-xs"
          >
            {t('selection.modeProtect')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="editInside"
            data-testid="selection-mode-editInside"
            className="h-7 px-2 text-xs"
          >
            {t('selection.modeEditInside')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {tool !== 'maskBrush' && (
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-xs">{t('selection.combineLabel')}</span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={selectionTools.combineMode}
            onValueChange={(v) => {
              if (v === 'replace' || v === 'add' || v === 'subtract' || v === 'intersect') {
                setSelectionToolOption('combineMode', v);
              }
            }}
            className="grid w-full grid-cols-4"
          >
            <ToggleGroupItem
              value="replace"
              data-testid="selection-combine-replace"
              className="h-6 px-1 text-[10px]"
            >
              {t('selection.combineReplace')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="add"
              data-testid="selection-combine-add"
              className="h-6 px-1 text-[10px]"
            >
              {t('selection.combineAdd')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="subtract"
              data-testid="selection-combine-subtract"
              className="h-6 px-1 text-[10px]"
            >
              {t('selection.combineSubtract')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="intersect"
              data-testid="selection-combine-intersect"
              className="h-6 px-1 text-[10px]"
            >
              {t('selection.combineIntersect')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {tool === 'magicWand' && (
        <div className="border-border space-y-2.5 border-t pt-2.5">
          <LabeledSlider
            label={t('selection.wandTolerance')}
            value={selectionTools.wandTolerancePct}
            min={0}
            max={100}
            step={1}
            decimals={0}
            suffix="%"
            onValueChange={(v) => setSelectionToolOption('wandTolerancePct', v)}
          />

          <div className="flex items-center justify-between">
            <Label htmlFor="wand-contiguous" className="text-muted-foreground text-xs font-normal">
              {t('selection.wandContiguous')}
            </Label>
            <Switch
              id="wand-contiguous"
              data-testid="selection-wand-contiguous"
              checked={selectionTools.wandContiguous}
              onCheckedChange={(v) => setSelectionToolOption('wandContiguous', v)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs font-normal">
              {t('selection.wandSampleMap')}
            </Label>
            <Select
              value={selectionTools.wandSampleMap}
              onValueChange={(v) => {
                if (v === 'active' || v === 'color' || v === 'height' || v === 'opacity') {
                  setSelectionToolOption('wandSampleMap', v);
                }
              }}
            >
              <SelectTrigger
                size="sm"
                data-testid="selection-wand-sample-map"
                className="h-7 w-full text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('selection.sampleActive')}</SelectItem>
                <SelectItem value="color">{t('maps.colorShort')}</SelectItem>
                <SelectItem value="height">{t('maps.heightShort')}</SelectItem>
                <SelectItem value="opacity">{t('maps.opacityShort')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {tool === 'maskBrush' && (
        <div className="border-border space-y-2 border-t pt-2.5">
          <span className="text-muted-foreground text-xs">{t('selection.maskBrushMode')}</span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={selectionTools.maskBrushErase ? 'erase' : 'paint'}
            onValueChange={(v) => {
              if (v === 'paint' || v === 'erase') {
                setSelectionToolOption('maskBrushErase', v === 'erase');
              }
            }}
            className="grid w-full grid-cols-2"
          >
            <ToggleGroupItem
              value="paint"
              data-testid="selection-maskbrush-paint"
              className="h-7 px-2 text-xs"
            >
              {t('selection.maskBrushPaint')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="erase"
              data-testid="selection-maskbrush-erase"
              className="h-7 px-2 text-xs"
            >
              {t('selection.maskBrushErase')}
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {t('selection.maskBrushHint')}
          </p>
        </div>
      )}

      <div className="border-border space-y-2 border-t pt-2.5">
        <span className="text-muted-foreground text-xs">{t('selection.actionsLabel')}</span>
        <div className="grid grid-cols-3 gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="selection-action-all"
                onClick={() => selectAllSelection()}
                className="h-7 text-xs"
              >
                {t('selection.selectAll')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('selection.selectAllTooltip')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                data-testid="selection-action-invert"
                onClick={() => invertSelection()}
                className="h-7 text-xs"
              >
                {t('selection.invert')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('selection.invertTooltip')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  data-testid="selection-action-clear"
                  disabled={!hasSelection}
                  onClick={() => clearSelection()}
                  className="h-7 w-full text-xs"
                >
                  {t('selection.clear')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('selection.clearTooltip')}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-end gap-1.5">
          <div className="flex-1 space-y-1">
            <Label htmlFor="selection-feather-px" className="text-muted-foreground text-[11px]">
              {t('selection.featherRadius')}
            </Label>
            <Input
              id="selection-feather-px"
              type="number"
              min={1}
              max={128}
              step={1}
              data-testid="selection-feather-input"
              value={featherPx}
              onChange={(e) => setFeatherPx(Math.max(1, Number(e.target.value) || 1))}
              className="h-7 font-mono text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="selection-feather-apply"
            disabled={!hasSelection}
            onClick={handleFeatherApply}
            className="h-7 px-2.5 text-xs"
          >
            {t('selection.featherApply')}
          </Button>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <Label
            htmlFor="selection-show-overlay"
            className="text-muted-foreground text-xs font-normal"
          >
            {t('selection.showOverlay')}
          </Label>
          <Switch
            id="selection-show-overlay"
            data-testid="selection-show-overlay"
            checked={showMaskOverlay}
            onCheckedChange={setShowMaskOverlay}
          />
        </div>
      </div>
    </div>
  );
}
