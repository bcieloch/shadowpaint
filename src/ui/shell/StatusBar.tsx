import { useUiStore } from '@/state/uiStore';
import { useI18n } from '@/ui/hooks/useI18n';
import { TaskProgress } from '@/ui/widgets/TaskProgress';

export function StatusBar() {
  const { t } = useI18n();
  const statusMessage = useUiStore((s) => s.statusMessage);

  return (
    <footer className="flex h-[26px] shrink-0 items-center justify-between border-t border-border bg-card px-3 font-mono text-[11px] text-muted-foreground select-none">
      {statusMessage ? (
        <span data-testid="statusbar-message" className="truncate font-medium text-amber-400">
          {t(statusMessage.key, statusMessage.params)}
        </span>
      ) : (
        <span data-testid="statusbar-message">{t('shell.statusBarReady')}</span>
      )}
      <div className="flex items-center gap-3">
        <TaskProgress />
        <span>{t('app.tagline')}</span>
      </div>
    </footer>
  );
}
