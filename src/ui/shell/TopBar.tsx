import { useCallback, useEffect, useRef } from 'react';
import {
  Archive,
  Box,
  ChevronDown,
  Columns2,
  Download,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Info,
  Layers3,
  Redo2,
  Save,
  SaveAll,
  Square,
  Undo2,
} from 'lucide-react';
import { AUTHOR_NAME, IDEA_AUTHOR_NAME, LICENSE_SPDX, REPOSITORY_URL } from '@/core/constants';
import { pickReliefFileWithFsAccess, supportsFileSystemAccess } from '@/persistence/fileAccess';
import { exportPackage } from '@/services/exportService';
import {
  OPEN_PROJECT_EVENT,
  requestOpenReliefFile,
  saveProjectRelief,
} from '@/services/fileService';
import { formatHistoryMeta, redoGlobal, undoGlobal } from '@/services/historyService';
import { useEditorStore } from '@/state/editorStore';
import {
  selectGlobalRedoEntry,
  selectGlobalUndoEntry,
  useHistoryStore,
} from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/ui/popover';
import { Separator } from '@/ui/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';
import { AutosaveIndicator } from '@/ui/widgets/AutosaveIndicator';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.11.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.69-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function TopBar() {
  const { locale, setLocale, t } = useI18n();
  const projectName = useProjectStore((s) => s.project.name);
  const isDirty = useProjectStore((s) => s.isDirty);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);
  const isTaskBusy = useUiStore((s) => s.tasks.length > 0);
  const layout = useEditorStore((s) => s.layout);
  const setLayout = useEditorStore((s) => s.setLayout);
  const undoEntry = useHistoryStore(selectGlobalUndoEntry);
  const redoEntry = useHistoryStore(selectGlobalRedoEntry);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const displayName = projectName === 'Untitled' ? t('app.untitledProject') : projectName;

  const handleOpenProject = useCallback(async () => {
    if (supportsFileSystemAccess()) {
      const picked = await pickReliefFileWithFsAccess();
      if (picked.status === 'picked') {
        await requestOpenReliefFile(picked.file, picked.handle);
      }
      return;
    }
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
    const onOpenRequest = () => {
      void handleOpenProject();
    };
    window.addEventListener(OPEN_PROJECT_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener(OPEN_PROJECT_EVENT, onOpenRequest);
    };
  }, [handleOpenProject]);

  const undoTooltip = undoEntry
    ? t('topbar.undoTooltip', { action: formatHistoryMeta(undoEntry.meta, t) })
    : t('topbar.undoEmptyTooltip');

  const redoTooltip = redoEntry
    ? t('topbar.redoTooltip', { action: formatHistoryMeta(redoEntry.meta, t) })
    : t('topbar.redoEmptyTooltip');

  return (
    <header className="border-border bg-card flex h-11 shrink-0 items-center justify-between border-b px-3 select-none">
      <div className="flex items-center gap-1.5">
        <div className="text-foreground flex shrink-0 items-center gap-1.5 font-semibold tracking-tight">
          <Layers3 className="text-primary size-4" aria-hidden="true" />
          <span>{t('app.name')}</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <span
          className="text-muted-foreground max-w-32 truncate text-xs 2xl:max-w-44"
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
              className="shrink-0 gap-1"
              onClick={() => setDialogOpen('newProjectOpen', true)}
              data-testid="btn-new-project"
            >
              <FilePlus2 className="size-3.5" />
              <span>{t('topbar.newProject')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('topbar.newProjectTooltip')}</TooltipContent>
        </Tooltip>

        <input
          ref={fileInputRef}
          type="file"
          accept=".relief,.zip"
          className="hidden"
          data-testid="open-project-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) {
              void requestOpenReliefFile(file);
            }
          }}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="shrink-0 gap-1"
              disabled={isTaskBusy}
              onClick={() => void handleOpenProject()}
              data-testid="btn-open-project"
            >
              <FolderOpen className="size-3.5" />
              <span>{t('topbar.openProject')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('topbar.openProjectTooltip')}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="shrink-0 gap-1"
                  disabled={isTaskBusy}
                  data-testid="btn-save-menu"
                  data-dirty={isDirty ? 'true' : 'false'}
                >
                  <Save className="size-3.5" />
                  <span>{t('topbar.saveMenu')}</span>
                  {isDirty && (
                    <span
                      className="bg-primary size-1.5 rounded-full"
                      data-testid="unsaved-dot"
                      aria-hidden="true"
                    />
                  )}
                  <ChevronDown className="text-muted-foreground size-3" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('topbar.saveMenuTooltip')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem
              data-testid="menu-save"
              onClick={() => void saveProjectRelief()}
            >
              <Save className="size-3.5" />
              <span>{t('topbar.saveAction')}</span>
              <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="menu-save-as"
              onClick={() => void saveProjectRelief({ saveAs: true })}
            >
              <SaveAll className="size-3.5" />
              <span>{t('topbar.saveAsAction')}</span>
              <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="menu-download-relief"
              onClick={() => void saveProjectRelief({ forceDownload: true })}
            >
              <Download className="size-3.5" />
              <span>{t('topbar.downloadReliefAction')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="shrink-0 gap-1"
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

        <div className="flex shrink-0 items-center gap-0.5">
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
          className="border-border bg-background flex shrink-0 items-center rounded-md border p-0.5"
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant={layout === 'split' ? 'secondary' : 'ghost'}
                className="h-6 gap-1 px-2 text-[11px] font-medium"
                onClick={() => setLayout('split')}
                aria-pressed={layout === 'split'}
                data-testid="layout-split"
              >
                <Columns2 className="size-3" />
                <span>{t('topbar.layoutSplit')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('topbar.layoutSplitTooltip')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <AutosaveIndicator />
        <Separator orientation="vertical" className="h-4" />

        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="gap-1 px-2"
                  data-testid="btn-about"
                >
                  <Info className="size-3.5" />
                  <span>{t('topbar.about')}</span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('topbar.aboutTooltip')}</TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            className="w-80 space-y-2.5 p-3.5"
            data-testid="about-popover"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Layers3 className="text-primary size-4" aria-hidden="true" />
                <span>{t('topbar.aboutTitle', { name: t('app.name') })}</span>
              </div>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {LICENSE_SPDX}
              </Badge>
            </div>
            <div className="text-muted-foreground space-y-1 text-xs leading-relaxed">
              <p className="text-foreground font-medium">
                {t('topbar.aboutAuthor', { author: AUTHOR_NAME })}
              </p>
              <p>{t('topbar.aboutIdea', { idea: IDEA_AUTHOR_NAME })}</p>
              <p className="text-[11px]">{t('topbar.aboutLicense', { license: LICENSE_SPDX })}</p>
            </div>
            <Button asChild size="xs" variant="outline" className="w-full gap-1.5">
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="about-github-link"
              >
                <GithubIcon className="size-3.5" />
                <span>{t('topbar.aboutOpenGithub')}</span>
                <ExternalLink className="ml-auto size-3" />
              </a>
            </Button>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="xs" variant="ghost" className="gap-1.5 px-2">
              <a
                href={REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-github"
                aria-label={t('topbar.githubTooltip', { license: LICENSE_SPDX })}
              >
                <GithubIcon className="size-3.5" />
                <span>{t('topbar.github')}</span>
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('topbar.githubTooltip', { license: LICENSE_SPDX })}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

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
