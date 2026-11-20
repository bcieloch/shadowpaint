import { useEffect } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { useEditorStore } from '@/state/editorStore';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/ui/components/ui/resizable';
import { ConfirmUnsavedDialog } from '@/ui/dialogs/ConfirmUnsavedDialog';
import { ImportWizardDialog } from '@/ui/dialogs/ImportWizard/ImportWizardDialog';
import { NewProjectDialog } from '@/ui/dialogs/NewProjectDialog';
import { RecentProjectsDialog } from '@/ui/dialogs/RecentProjectsDialog';
import { RestoreSessionDialog } from '@/ui/dialogs/RestoreSessionDialog';
import { ShortcutsDialog } from '@/ui/dialogs/ShortcutsDialog';
import { LeftPanel } from '@/ui/shell/LeftPanel';
import { RightPanel } from '@/ui/shell/RightPanel';
import { StatusBar } from '@/ui/shell/StatusBar';
import { TopBar } from '@/ui/shell/TopBar';
import { ViewportHost } from '@/ui/shell/ViewportHost';
import { WindowDropOverlay } from '@/ui/shell/WindowDropOverlay';

export function StudioShell() {
  const panelsHidden = useEditorStore((s) => s.panelsHidden);
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();

  useEffect(() => {
    const left = leftPanelRef.current;
    const right = rightPanelRef.current;
    if (panelsHidden) {
      left?.collapse();
      right?.collapse();
    } else {
      left?.expand();
      right?.expand();
    }
  }, [leftPanelRef, panelsHidden, rightPanelRef]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" id="studio-shell-panels">
          <ResizablePanel
            id="left-panel"
            panelRef={leftPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize={264}
            minSize={200}
            maxSize={380}
          >
            <LeftPanel />
          </ResizablePanel>
          <ResizableHandle className={panelsHidden ? 'hidden' : undefined} />
          <ResizablePanel id="viewport-panel" minSize={320}>
            <ViewportHost />
          </ResizablePanel>
          <ResizableHandle className={panelsHidden ? 'hidden' : undefined} />
          <ResizablePanel
            id="right-panel"
            panelRef={rightPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize={320}
            minSize={240}
            maxSize={460}
          >
            <RightPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <StatusBar />
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
