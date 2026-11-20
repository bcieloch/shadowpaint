import { useI18n } from '@/ui/hooks/useI18n';

export function ViewportHost() {
  const { t } = useI18n();

  return (
    <section
      aria-label={t('shell.viewportTitle')}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#121214]"
    />
  );
}
