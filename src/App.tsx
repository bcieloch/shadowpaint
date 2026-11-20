import { Toaster } from '@/ui/components/ui/sonner';
import { TooltipProvider } from '@/ui/components/ui/tooltip';
import { StudioShell } from '@/ui/shell/StudioShell';
import { WebGL2Gate } from '@/ui/shell/WebGL2Gate';

export function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <WebGL2Gate>
        <StudioShell />
      </WebGL2Gate>
      <Toaster />
    </TooltipProvider>
  );
}
