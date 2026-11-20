import { useEffect } from 'react';
import { toast } from 'sonner';
import { ensureInitialProjectAllocated } from '@/services/projectService';
import { Toaster } from '@/ui/components/ui/sonner';
import { TooltipProvider } from '@/ui/components/ui/tooltip';
import { useI18n } from '@/ui/hooks/useI18n';
import { StudioShell } from '@/ui/shell/StudioShell';
import { WebGL2Gate } from '@/ui/shell/WebGL2Gate';

export function App() {
  const { t } = useI18n();

  useEffect(() => {
    const res = ensureInitialProjectAllocated();
    if (!res.ok) {
      toast.error(t('newProject.outOfMemoryError', { mb: res.requiredMb }));
    }
  }, [t]);

  return (
    <TooltipProvider delayDuration={300}>
      <WebGL2Gate>
        <StudioShell />
      </WebGL2Gate>
      <Toaster />
    </TooltipProvider>
  );
}
