import {
  Blend,
  CircleDashed,
  Contrast,
  Droplet,
  Eraser,
  Hand,
  Lasso,
  PaintBucket,
  Paintbrush,
  Pipette,
  Shield,
  SquareDashed,
  WandSparkles,
} from 'lucide-react';
import { useEditorStore, type ToolId } from '@/state/editorStore';
import { Button } from '@/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';

interface ToolItem {
  id: ToolId;
  labelKey:
    | 'tools.brush'
    | 'tools.eraser'
    | 'tools.smooth'
    | 'tools.blur'
    | 'tools.gradient'
    | 'tools.fill'
    | 'tools.eyedropper'
    | 'tools.pan'
    | 'tools.selectRect'
    | 'tools.selectEllipse'
    | 'tools.selectLasso'
    | 'tools.magicWand'
    | 'tools.maskBrush';
  tooltipKey:
    | 'tools.brushTooltip'
    | 'tools.eraserTooltip'
    | 'tools.smoothTooltip'
    | 'tools.blurTooltip'
    | 'tools.gradientTooltip'
    | 'tools.fillTooltip'
    | 'tools.eyedropperTooltip'
    | 'tools.panTooltip'
    | 'tools.selectRectTooltip'
    | 'tools.selectEllipseTooltip'
    | 'tools.selectLassoTooltip'
    | 'tools.magicWandTooltip'
    | 'tools.maskBrushTooltip';
  icon: typeof Paintbrush;
}

const TOOL_ITEMS: readonly ToolItem[] = [
  { id: 'brush', labelKey: 'tools.brush', tooltipKey: 'tools.brushTooltip', icon: Paintbrush },
  { id: 'eraser', labelKey: 'tools.eraser', tooltipKey: 'tools.eraserTooltip', icon: Eraser },
  { id: 'smooth', labelKey: 'tools.smooth', tooltipKey: 'tools.smoothTooltip', icon: Blend },
  { id: 'blur', labelKey: 'tools.blur', tooltipKey: 'tools.blurTooltip', icon: Droplet },
  {
    id: 'gradient',
    labelKey: 'tools.gradient',
    tooltipKey: 'tools.gradientTooltip',
    icon: Contrast,
  },
  { id: 'fill', labelKey: 'tools.fill', tooltipKey: 'tools.fillTooltip', icon: PaintBucket },
  {
    id: 'eyedropper',
    labelKey: 'tools.eyedropper',
    tooltipKey: 'tools.eyedropperTooltip',
    icon: Pipette,
  },
  { id: 'pan', labelKey: 'tools.pan', tooltipKey: 'tools.panTooltip', icon: Hand },
  {
    id: 'selectRect',
    labelKey: 'tools.selectRect',
    tooltipKey: 'tools.selectRectTooltip',
    icon: SquareDashed,
  },
  {
    id: 'selectEllipse',
    labelKey: 'tools.selectEllipse',
    tooltipKey: 'tools.selectEllipseTooltip',
    icon: CircleDashed,
  },
  {
    id: 'selectLasso',
    labelKey: 'tools.selectLasso',
    tooltipKey: 'tools.selectLassoTooltip',
    icon: Lasso,
  },
  {
    id: 'magicWand',
    labelKey: 'tools.magicWand',
    tooltipKey: 'tools.magicWandTooltip',
    icon: WandSparkles,
  },
  {
    id: 'maskBrush',
    labelKey: 'tools.maskBrush',
    tooltipKey: 'tools.maskBrushTooltip',
    icon: Shield,
  },
];

export function ToolPalette() {
  const { t } = useI18n();
  const activeTool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <section className="border-border space-y-2 border-b p-3">
      <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {t('tools.sectionTitle')}
      </h2>
      <div className="grid grid-cols-5 gap-1.5">
        {TOOL_ITEMS.map(({ id, labelKey, tooltipKey, icon: Icon }) => {
          const active = activeTool === id;
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  aria-label={t(labelKey)}
                  data-testid={`tool-${id}`}
                  onClick={() => setTool(id)}
                  className="h-8 w-full px-0"
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t(tooltipKey)}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}
