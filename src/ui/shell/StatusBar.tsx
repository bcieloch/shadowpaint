import { useI18n } from '@/ui/hooks/useI18n';

export function StatusBar() {
  const { t } = useI18n();

  return (
    <footer className="flex h-[26px] shrink-0 items-center justify-between border-t border-border bg-card px-3 font-mono text-[11px] text-muted-foreground select-none">
      <span>{t('shell.statusBarReady')}</span>
      <span>{t('app.tagline')}</span>
    </footer>
  );
}
