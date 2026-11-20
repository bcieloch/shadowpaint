import { useEffect } from 'react';
import { toast } from 'sonner';
import { createTranslator } from '@/i18n';
import { useLocaleStore } from '@/i18n/localeStore';
import { autosaveController, runWithoutAutosaveTracking } from '@/persistence/autosave';
import { startUiLayoutSync } from '@/persistence/uiLayoutSync';
import { ensureInitialProjectAllocated } from '@/services/projectService';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { Toaster } from '@/ui/components/ui/sonner';
import { TooltipProvider } from '@/ui/components/ui/tooltip';
import { StudioShell } from '@/ui/shell/StudioShell';
import { WebGL2Gate } from '@/ui/shell/WebGL2Gate';

export function App() {
  useEffect(() => {
    const res = runWithoutAutosaveTracking(() => ensureInitialProjectAllocated());
    if (!res.ok) {
      const tr = createTranslator(useLocaleStore.getState().locale);
      toast.error(tr('newProject.outOfMemoryError', { mb: res.requiredMb }));
    }

    autosaveController.setOnQuotaExceeded(() => {
      const tr = createTranslator(useLocaleStore.getState().locale);
      toast.error(tr('autosave.quotaExceeded'), {
        action: {
          label: tr('autosave.manageProjects'),
          onClick: () => useUiStore.getState().setDialogOpen('recentProjectsOpen', true),
        },
      });
    });
    autosaveController.start();
    const stopUiLayoutSync = startUiLayoutSync();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopUiLayoutSync();
      autosaveController.setOnQuotaExceeded(undefined);
      autosaveController.stop();
    };
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <WebGL2Gate>
        <StudioShell />
      </WebGL2Gate>
      <Toaster />
    </TooltipProvider>
  );
}
