import { Eraser, Hand, Paintbrush, Pipette } from 'lucide-react';
import { useEditorStore, type ToolId } from '@/state/editorStore';
import { Button } from '@/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';

interface ToolItem {
  id: ToolId;
  labelKey: 'tools.brush' | 'tools.eraser' | 'tools.eyedropper' | 'tools.pan';
  tooltipKey:
    | 'tools.brushTooltip'
    | 'tools.eraserTooltip'
    | 'tools.eyedropperTooltip'
    | 'tools.panTooltip';
  icon: typeof Paintbrush;
}

const TOOL_ITEMS: readonly ToolItem[] = [
  { id: 'brush', labelKey: 'tools.brush', tooltipKey: 'tools.brushTooltip', icon: Paintbrush },
  { id: 'eraser', labelKey: 'tools.eraser', tooltipKey: 'tools.eraserTooltip', icon: Eraser },
  {
    id: 'eyedropper',
    labelKey: 'tools.eyedropper',
    tooltipKey: 'tools.eyedropperTooltip',
    icon: Pipette,
  },
  { id: 'pan', labelKey: 'tools.pan', tooltipKey: 'tools.panTooltip', icon: Hand },
];

export function ToolPalette() {
  const { t } = useI18n();
  const activeTool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <section className="space-y-2 border-b border-border p-3">
      <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {t('tools.sectionTitle')}
      </h2>
      <div className="grid grid-cols-4 gap-1.5">
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
