import { useEffect } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { clampPanelSizesForBreakpoint, getPanelBounds } from '@/core/layout';
import { useEditorStore } from '@/state/editorStore';
import { useUiStore } from '@/state/uiStore';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/ui/components/ui/resizable';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/ui/components/ui/sheet';
import { ConfirmUnsavedDialog } from '@/ui/dialogs/ConfirmUnsavedDialog';
import { ImportWizardDialog } from '@/ui/dialogs/ImportWizard/ImportWizardDialog';
import { NewProjectDialog } from '@/ui/dialogs/NewProjectDialog';
import { RecentProjectsDialog } from '@/ui/dialogs/RecentProjectsDialog';
import { RestoreSessionDialog } from '@/ui/dialogs/RestoreSessionDialog';
import { ShortcutsDialog } from '@/ui/dialogs/ShortcutsDialog';
import { useI18n } from '@/ui/hooks/useI18n';
import { useViewportBreakpoint } from '@/ui/hooks/useViewportBreakpoint';
import { LeftPanel } from '@/ui/shell/LeftPanel';
import { RightPanel } from '@/ui/shell/RightPanel';
import { StatusBar } from '@/ui/shell/StatusBar';
import { TopBar } from '@/ui/shell/TopBar';
import { ViewportHost } from '@/ui/shell/ViewportHost';
import { WindowDropOverlay } from '@/ui/shell/WindowDropOverlay';

export function StudioShell() {
  const { t } = useI18n();
  const breakpoint = useViewportBreakpoint();
  const isDrawerMode = breakpoint === 'drawer';

  const panelsHidden = useEditorStore((s) => s.panelsHidden);
  const leftPanelSize = useEditorStore((s) => s.leftPanelSize);
  const rightPanelSize = useEditorStore((s) => s.rightPanelSize);
  const uiLayoutHydrated = useEditorStore((s) => s.uiLayoutHydrated);
  const setPanelSizes = useEditorStore((s) => s.setPanelSizes);

  const leftDrawerOpen = useUiStore((s) => s.leftDrawerOpen);
  const rightDrawerOpen = useUiStore((s) => s.rightDrawerOpen);
  const setLeftDrawerOpen = useUiStore((s) => s.setLeftDrawerOpen);
  const setRightDrawerOpen = useUiStore((s) => s.setRightDrawerOpen);

  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();

  const bounds = getPanelBounds(breakpoint);
  const clampedSizes = clampPanelSizesForBreakpoint(
    { leftPanelSize, rightPanelSize },
    breakpoint,
  );

  // Close slide-over drawers when leaving drawer breakpoint
  useEffect(() => {
    if (!isDrawerMode) {
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
    }
  }, [isDrawerMode, setLeftDrawerOpen, setRightDrawerOpen]);

  // Sync collapse state and persisted/clamped widths in docked modes
  useEffect(() => {
    if (isDrawerMode) return;
    const left = leftPanelRef.current;
    const right = rightPanelRef.current;
    if (panelsHidden) {
      left?.collapse();
      right?.collapse();
      return;
    }
    left?.expand();
    right?.expand();
    left?.resize(clampedSizes.leftPanelSize);
    right?.resize(clampedSizes.rightPanelSize);
  }, [
    breakpoint,
    clampedSizes.leftPanelSize,
    clampedSizes.rightPanelSize,
    isDrawerMode,
    leftPanelRef,
    panelsHidden,
    rightPanelRef,
    uiLayoutHydrated,
  ]);

  return (
    <div
      data-breakpoint={breakpoint}
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
    >
      <TopBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        {isDrawerMode ? (
          <div className="h-full w-full overflow-hidden">
            <ViewportHost />
          </div>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            id="studio-shell-panels"
            onLayoutChanged={(_layout, meta) => {
              if (!meta.isUserInteraction || panelsHidden) return;
              const leftPx = leftPanelRef.current?.getSize().inPixels;
              const rightPx = rightPanelRef.current?.getSize().inPixels;
              if (
                typeof leftPx === 'number' &&
                Number.isFinite(leftPx) &&
                typeof rightPx === 'number' &&
                Number.isFinite(rightPx)
              ) {
                setPanelSizes({
                  leftPanelSize: leftPx,
                  rightPanelSize: rightPx,
                });
              }
            }}
          >
            <ResizablePanel
              id="left-panel"
              panelRef={leftPanelRef}
              collapsible
              collapsedSize={0}
              defaultSize={clampedSizes.leftPanelSize}
              minSize={bounds.leftMin}
              maxSize={bounds.leftMax}
            >
              <LeftPanel />
            </ResizablePanel>
            <ResizableHandle
              disabled={panelsHidden}
              aria-label={t('shell.leftPanelHandleLabel')}
              className={panelsHidden ? 'hidden' : undefined}
            />
            <ResizablePanel id="viewport-panel" minSize={bounds.viewportMin}>
              <ViewportHost />
            </ResizablePanel>
            <ResizableHandle
              disabled={panelsHidden}
              aria-label={t('shell.rightPanelHandleLabel')}
              className={panelsHidden ? 'hidden' : undefined}
            />
            <ResizablePanel
              id="right-panel"
              panelRef={rightPanelRef}
              collapsible
              collapsedSize={0}
              defaultSize={clampedSizes.rightPanelSize}
              minSize={bounds.rightMin}
              maxSize={bounds.rightMax}
            >
              <RightPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      <StatusBar />

      {isDrawerMode && (
        <>
          <Sheet open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen}>
            <SheetContent
              side="left"
              className="w-72 p-0"
              closeLabel={t('common.close')}
              data-testid="left-drawer-sheet"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{t('shell.leftPanelTitle')}</SheetTitle>
                <SheetDescription>{t('shell.leftPanelTitle')}</SheetDescription>
              </SheetHeader>
              <LeftPanel />
            </SheetContent>
          </Sheet>

          <Sheet open={rightDrawerOpen} onOpenChange={setRightDrawerOpen}>
            <SheetContent
              side="right"
              className="w-80 p-0"
              closeLabel={t('common.close')}
              data-testid="right-drawer-sheet"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{t('shell.rightPanelTitle')}</SheetTitle>
                <SheetDescription>{t('shell.rightPanelTitle')}</SheetDescription>
              </SheetHeader>
              <RightPanel />
            </SheetContent>
          </Sheet>
        </>
      )}

      <NewProjectDialog />
      <ImportWizardDialog />
      <RecentProjectsDialog />
      <RestoreSessionDialog />
      <ConfirmUnsavedDialog />
      <ShortcutsDialog />
      <WindowDropOverlay />
    </div>
  );
}
