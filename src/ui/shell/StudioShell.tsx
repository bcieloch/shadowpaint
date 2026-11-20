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
import { LeftPanel } from '@/ui/shell/LeftPanel';
import { RightPanel } from '@/ui/shell/RightPanel';
import { StatusBar } from '@/ui/shell/StatusBar';
import { TopBar } from '@/ui/shell/TopBar';
import { ViewportHost } from '@/ui/shell/ViewportHost';
import { WindowDropOverlay } from '@/ui/shell/WindowDropOverlay';

export function StudioShell() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" id="studio-shell-panels">
          <ResizablePanel id="left-panel" defaultSize={264} minSize={200} maxSize={380}>
            <LeftPanel />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="viewport-panel" minSize={320}>
            <ViewportHost />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="right-panel" defaultSize={320} minSize={240} maxSize={460}>
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
      <WindowDropOverlay />
    </div>
  );
}
