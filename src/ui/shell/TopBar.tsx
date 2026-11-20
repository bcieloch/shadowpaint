import { FilePlus2, Layers3 } from 'lucide-react';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
import { Separator } from '@/ui/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';

export function TopBar() {
  const { locale, setLocale, t } = useI18n();
  const projectName = useProjectStore((s) => s.project.name);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);

  const displayName =
    projectName === 'Untitled' ? t('app.untitledProject') : projectName;

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-3 select-none">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 font-semibold tracking-tight text-foreground">
          <Layers3 className="size-4 text-primary" aria-hidden="true" />
          <span>{t('app.name')}</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <span
          className="max-w-52 truncate text-xs text-muted-foreground"
          data-testid="topbar-project-name"
        >
          {displayName}
        </span>
        <Separator orientation="vertical" className="h-4" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="gap-1.5"
              onClick={() => setDialogOpen('newProjectOpen', true)}
              data-testid="btn-new-project"
            >
              <FilePlus2 className="size-3.5" />
              <span>{t('topbar.newProject')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('topbar.newProjectTooltip')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex items-center rounded-md border border-border bg-background p-0.5"
          role="group"
          aria-label={t('language.label')}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant={locale === 'en' ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-[11px] font-medium"
                onClick={() => setLocale('en')}
                aria-pressed={locale === 'en'}
                data-testid="lang-en"
              >
                {t('language.en')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('language.switchToEnglish')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant={locale === 'pl' ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-[11px] font-medium"
                onClick={() => setLocale('pl')}
                aria-pressed={locale === 'pl'}
                data-testid="lang-pl"
              >
                {t('language.pl')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('language.switchToPolish')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
