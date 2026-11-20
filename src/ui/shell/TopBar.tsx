import { Archive, Box, FilePlus2, Layers3, Redo2, Square, Undo2 } from 'lucide-react';
import { exportPackage } from '@/services/exportService';
import { formatHistoryMeta, redoGlobal, undoGlobal } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import {
  selectGlobalRedoEntry,
  selectGlobalUndoEntry,
  useHistoryStore,
} from '@/state/historyStore';
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
  const isTaskBusy = useUiStore((s) => s.tasks.length > 0);
  const layout = useEditorStore((s) => s.layout);
  const setLayout = useEditorStore((s) => s.setLayout);
  const undoEntry = useHistoryStore(selectGlobalUndoEntry);
  const redoEntry = useHistoryStore(selectGlobalRedoEntry);

  const displayName = projectName === 'Untitled' ? t('app.untitledProject') : projectName;

  const undoTooltip = undoEntry
    ? t('topbar.undoTooltip', { action: formatHistoryMeta(undoEntry.meta, t) })
    : t('topbar.undoEmptyTooltip');

  const redoTooltip = redoEntry
    ? t('topbar.redoTooltip', { action: formatHistoryMeta(redoEntry.meta, t) })
    : t('topbar.redoEmptyTooltip');

  return (
    <header className="border-border bg-card flex h-11 shrink-0 items-center justify-between border-b px-3 select-none">
      <div className="flex items-center gap-2.5">
        <div className="text-foreground flex items-center gap-1.5 font-semibold tracking-tight">
          <Layers3 className="text-primary size-4" aria-hidden="true" />
          <span>{t('app.name')}</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <span
          className="text-muted-foreground max-w-52 truncate text-xs"
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="gap-1.5"
              disabled={isTaskBusy}
              onClick={() => void exportPackage()}
              data-testid="btn-export-package"
            >
              <Archive className="size-3.5" />
              <span>{t('topbar.exportPackage')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('topbar.exportPackageTooltip')}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="gap-1 px-2"
                  disabled={!undoEntry}
                  onClick={() => undoGlobal()}
                  aria-label={undoTooltip}
                  data-testid="btn-undo"
                >
                  <Undo2 className="size-3.5" />
                  <span>{t('topbar.undo')}</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{undoTooltip}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="gap-1 px-2"
                  disabled={!redoEntry}
                  onClick={() => redoGlobal()}
                  aria-label={redoTooltip}
                  data-testid="btn-redo"
                >
                  <Redo2 className="size-3.5" />
                  <span>{t('topbar.redo')}</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{redoTooltip}</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-4" />

        <div
          className="border-border bg-background flex items-center rounded-md border p-0.5"
          role="group"
          aria-label={t('topbar.layoutLabel')}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant={layout === '2d' ? 'secondary' : 'ghost'}
                className="h-6 gap-1 px-2 text-[11px] font-medium"
                onClick={() => setLayout('2d')}
                aria-pressed={layout === '2d'}
                data-testid="layout-2d"
              >
                <Square className="size-3" />
                <span>{t('topbar.layout2d')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('topbar.layout2dTooltip')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant={layout === '3d' ? 'secondary' : 'ghost'}
                className="h-6 gap-1 px-2 text-[11px] font-medium"
                onClick={() => setLayout('3d')}
                aria-pressed={layout === '3d'}
                data-testid="layout-3d"
              >
                <Box className="size-3" />
                <span>{t('topbar.layout3d')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('topbar.layout3dTooltip')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="border-border bg-background flex items-center rounded-md border p-0.5"
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
