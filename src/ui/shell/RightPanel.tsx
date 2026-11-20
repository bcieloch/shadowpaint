import { ScrollArea } from '@/ui/components/ui/scroll-area';
import { useI18n } from '@/ui/hooks/useI18n';

export function RightPanel() {
  const { t } = useI18n();

  return (
    <aside
      aria-label={t('shell.rightPanelTitle')}
      className="flex h-full w-full flex-col bg-card text-foreground"
    >
      <div className="flex h-8 shrink-0 items-center border-b border-border px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {t('shell.rightPanelTitle')}
      </div>
      <ScrollArea className="min-h-0 flex-1" />
    </aside>
  );
}
