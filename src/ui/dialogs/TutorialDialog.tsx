import { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  FolderArchive,
  Keyboard,
  Layers,
  Lightbulb,
  Paintbrush,
  Play,
  Ruler,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  formatShortcutDisplay,
  isMacPlatform,
  type ShortcutItemId,
} from '@/core/shortcuts';
import {
  FEATURE_GUIDE_SECTIONS,
  type FeatureCategoryId,
  type GuideTabId,
  TUTORIAL_STEPS,
  type TutorialStepAction,
  type TutorialStepId,
} from '@/core/tutorial';
import { useEditorStore } from '@/state/editorStore';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/ui/dialog';
import { ScrollArea } from '@/ui/components/ui/scroll-area';
import { useI18n } from '@/ui/hooks/useI18n';

const STEP_ICONS: Record<TutorialStepId, typeof Layers> = {
  canvasAndImport: Layers,
  mapsAndPainting: Paintbrush,
  selectionAndAdjustments: Sliders,
  lightingAndOptics: Sparkles,
  measurementAndSection: Ruler,
  persistenceAndExport: FolderArchive,
};

const FEATURE_ICONS: Record<FeatureCategoryId, typeof Layers> = {
  mapsAndImport: Layers,
  paintingAndMasking: Paintbrush,
  lightingAndOptics: Sparkles,
  measurementAndSection: Ruler,
  workspaceAndShortcuts: Compass,
  persistenceAndExport: FolderArchive,
};

export function TutorialDialog() {
  const { t } = useI18n();
  const open = useUiStore((s) => s.dialogs.guideOpen);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);
  const setRightTab = useUiStore((s) => s.setRightTab);

  const customShortcuts = useEditorStore((s) => s.customShortcuts);
  const setTool = useEditorStore((s) => s.setTool);
  const setActiveMap = useEditorStore((s) => s.setActiveMap);
  const setLayout = useEditorStore((s) => s.setLayout);

  const [activeTab, setActiveTab] = useState<GuideTabId>('tutorial');
  const [stepIndex, setStepIndex] = useState(0);

  const isMac = useMemo(() => isMacPlatform(), []);
  const activeStep = TUTORIAL_STEPS[stepIndex] ?? TUTORIAL_STEPS[0];
  if (!activeStep) return null;
  const ActiveStepIcon = STEP_ICONS[activeStep.id];

  const formatEffectiveShortcut = (id: ShortcutItemId): string =>
    formatShortcutDisplay(id, customShortcuts, isMac);

  const runTutorialAction = (action: TutorialStepAction) => {
    if (action.activeMap) {
      setActiveMap(action.activeMap);
    }
    if (action.layout) {
      setLayout(action.layout);
    }
    if (action.rightTab) {
      setRightTab(action.rightTab);
    }
    if (action.tool) {
      setTool(action.tool);
    }
    setDialogOpen('guideOpen', false);

    if (action.kind === 'openNewProject') {
      setDialogOpen('newProjectOpen', true);
    } else if (action.kind === 'openImportWizard') {
      setDialogOpen('importWizardOpen', true);
    } else if (action.kind === 'openShortcuts') {
      setDialogOpen('shortcutsOpen', true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => setDialogOpen('guideOpen', v)}>
      <DialogContent
        className="bg-card text-foreground flex max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl"
        data-testid="tutorial-dialog"
      >
        <DialogHeader className="shrink-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="text-primary size-4" aria-hidden="true" />
              <span>{t('guide.dialogTitle')}</span>
            </DialogTitle>
            <div className="bg-muted inline-flex rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('tutorial')}
                data-testid="guide-tab-tutorial"
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === 'tutorial'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('guide.tabTutorial')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('features')}
                data-testid="guide-tab-features"
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === 'features'
                    ? 'bg-background text-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('guide.tabFeatures')}
              </button>
            </div>
          </div>
          <DialogDescription>{t('guide.dialogDescription')}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden pr-2">
          {activeTab === 'tutorial' ? (
            <div className="space-y-4 py-1" data-testid="guide-panel-tutorial">
              {/* Step selector pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {TUTORIAL_STEPS.map((step, idx) => {
                  const isCurrent = idx === stepIndex;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setStepIndex(idx)}
                      data-testid={`tutorial-pill-${step.id}`}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isCurrent
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="font-mono text-[11px] font-semibold">
                        {step.stepNumber}.
                      </span>
                      <span className="max-w-44 truncate">
                        {t(`guide.steps.${step.id}.title` as const).replace(/^[0-9]+\.\s*/, '')}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active step detailed card */}
              <section
                className="border-primary/40 bg-background/70 space-y-3 rounded-lg border p-4"
                data-testid="tutorial-active-step"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="bg-primary/15 text-primary inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                    <ActiveStepIcon className="size-3.5" aria-hidden="true" />
                    <span>
                      {t('guide.stepBadge', {
                        step: activeStep.stepNumber,
                        total: TUTORIAL_STEPS.length,
                      })}
                    </span>
                  </span>

                  {activeStep.shortcutId && (
                    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                      <span>{t('guide.shortcutLabel')}</span>
                      <kbd
                        className="border-border bg-card text-foreground rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium"
                        data-testid="tutorial-active-shortcut"
                      >
                        {formatEffectiveShortcut(activeStep.shortcutId)}
                      </kbd>
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-foreground text-base font-semibold">
                    {t(`guide.steps.${activeStep.id}.title` as const)}
                  </h3>
                  <p className="text-foreground/90 text-xs font-medium">
                    {t(`guide.steps.${activeStep.id}.summary` as const)}
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {t(`guide.steps.${activeStep.id}.details` as const)}
                  </p>
                </div>

                <div className="border-border bg-card/80 flex items-start gap-2 rounded-md border p-2.5 text-xs">
                  <Lightbulb className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-foreground font-semibold">
                      {t('guide.proTipLabel')}:{' '}
                    </span>
                    <span className="text-muted-foreground">
                      {t(`guide.steps.${activeStep.id}.tip` as const)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={stepIndex === 0}
                      onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                      data-testid="tutorial-prev-step"
                      className="gap-1"
                    >
                      <ChevronLeft className="size-3.5" aria-hidden="true" />
                      <span>{t('guide.prevStep')}</span>
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={stepIndex === TUTORIAL_STEPS.length - 1}
                      onClick={() =>
                        setStepIndex((i) => Math.min(TUTORIAL_STEPS.length - 1, i + 1))
                      }
                      data-testid="tutorial-next-step"
                      className="gap-1"
                    >
                      <span>{t('guide.nextStep')}</span>
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>

                  <Button
                    type="button"
                    size="xs"
                    variant="default"
                    onClick={() => runTutorialAction(activeStep.action)}
                    data-testid={`tutorial-try-${activeStep.id}`}
                    className="gap-1.5"
                  >
                    <Play className="size-3" aria-hidden="true" />
                    <span>{t(`guide.steps.${activeStep.id}.tryAction` as const)}</span>
                  </Button>
                </div>
              </section>

              {/* Overview grid of all 6 workflow stages */}
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {TUTORIAL_STEPS.map((step, idx) => {
                  const Icon = STEP_ICONS[step.id];
                  const isCurrent = idx === stepIndex;
                  return (
                    <div
                      key={step.id}
                      data-testid={`tutorial-step-${step.id}`}
                      onClick={() => setStepIndex(idx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setStepIndex(idx);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`cursor-pointer space-y-1.5 rounded-md border p-3 text-left transition-colors ${
                        isCurrent
                          ? 'border-primary/60 bg-primary/5'
                          : 'border-border bg-background/40 hover:bg-background/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
                          <Icon className="text-primary size-3.5 shrink-0" aria-hidden="true" />
                          <span>{t(`guide.steps.${step.id}.title` as const)}</span>
                        </span>
                        {step.shortcutId && (
                          <kbd className="border-border bg-background text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                            {formatEffectiveShortcut(step.shortcutId)}
                          </kbd>
                        )}
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-snug">
                        {t(`guide.steps.${step.id}.summary` as const)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 gap-3 py-1 md:grid-cols-2"
              data-testid="guide-panel-features"
            >
              {FEATURE_GUIDE_SECTIONS.map((section) => {
                const Icon = FEATURE_ICONS[section.id];
                return (
                  <section
                    key={section.id}
                    className="border-border bg-background/50 flex flex-col justify-between space-y-2.5 rounded-md border p-3.5"
                    data-testid={`feature-section-${section.id}`}
                  >
                    <div className="space-y-2">
                      <div>
                        <h3 className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
                          <Icon className="text-primary size-3.5 shrink-0" aria-hidden="true" />
                          <span>{t(`guide.features.${section.id}.title` as const)}</span>
                        </h3>
                        <p className="text-muted-foreground text-[11px]">
                          {t(`guide.features.${section.id}.subtitle` as const)}
                        </p>
                      </div>

                      <ul className="text-foreground/90 list-disc space-y-1.5 pl-4 text-xs leading-snug">
                        <li>{t(`guide.features.${section.id}.bullet1` as const)}</li>
                        <li>{t(`guide.features.${section.id}.bullet2` as const)}</li>
                        <li>{t(`guide.features.${section.id}.bullet3` as const)}</li>
                        <li>{t(`guide.features.${section.id}.bullet4` as const)}</li>
                      </ul>
                    </div>

                    <div className="border-border/60 flex flex-wrap items-center gap-1 border-t pt-2">
                      {section.shortcutIds.map((sid) => (
                        <span
                          key={sid}
                          className="border-border bg-card text-muted-foreground inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
                          data-testid={`feature-shortcut-${sid}`}
                        >
                          <span>{t(`shortcuts.items.${sid}` as const)}:</span>
                          <kbd className="text-foreground font-mono font-semibold">
                            {formatEffectiveShortcut(sid)}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex shrink-0 items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDialogOpen('guideOpen', false);
              setDialogOpen('shortcutsOpen', true);
            }}
            data-testid="guide-open-shortcuts"
            className="gap-1.5"
          >
            <Keyboard className="size-3.5" aria-hidden="true" />
            <span>{t('guide.customizeShortcutsButton')}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDialogOpen('guideOpen', false)}
            data-testid="tutorial-close"
          >
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
