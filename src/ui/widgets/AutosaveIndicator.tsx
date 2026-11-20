import { AlertCircle, Check, Clock, History, Loader2 } from 'lucide-react';
import type { Locale } from '@/i18n';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';

function formatSavedTime(iso: string | null, locale: Locale): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(locale === 'pl' ? 'pl-PL' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AutosaveIndicator() {
  const { locale, t } = useI18n();
  const status = useUiStore((s) => s.autosaveStatus);
  const timestamp = useUiStore((s) => s.autosaveTimestamp);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);

  const timeText = formatSavedTime(timestamp, locale);

  let label: string;
  let colorClass = 'text-muted-foreground';
  let icon = <Clock className="size-3" />;

  if (status === 'unsaved') {
    label = t('autosave.unsaved');
    colorClass = 'text-amber-400';
    icon = <span className="size-1.5 rounded-full bg-amber-400" aria-hidden="true" />;
  } else if (status === 'saving') {
    label = t('autosave.saving');
    colorClass = 'text-sky-400';
    icon = <Loader2 className="size-3 animate-spin" />;
  } else if (status === 'saved') {
    label = t('autosave.savedAt', { time: timeText || '--:--' });
    colorClass = 'text-emerald-400';
    icon = <Check className="size-3" />;
  } else if (status === 'error') {
    label = t('autosave.error');
    colorClass = 'text-destructive';
    icon = <AlertCircle className="size-3" />;
  } else {
    label = t('autosave.idle');
  }

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={`h-6 gap-1.5 px-2 text-[11px] font-normal ${colorClass}`}
            onClick={() => setDialogOpen('recentProjectsOpen', true)}
            data-testid="autosave-indicator"
            data-status={status}
          >
            {icon}
            <span>{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('autosave.tooltip')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => setDialogOpen('recentProjectsOpen', true)}
            aria-label={t('autosave.recentButton')}
            data-testid="btn-recent-projects"
          >
            <History className="size-3" />
            <span className="hidden xl:inline">{t('autosave.recentButton')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('autosave.recentButtonTooltip')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
