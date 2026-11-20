import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { detectWebGL2Support } from '@/lib/webgl';
import { useI18n } from '@/ui/hooks/useI18n';

interface WebGL2GateProps {
  children: ReactNode;
  supported?: boolean;
}

export function WebGL2Gate({ children, supported }: WebGL2GateProps) {
  const { t } = useI18n();
  const [hasWebGL2] = useState(() => supported ?? detectWebGL2Support());

  if (!hasWebGL2) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-card p-6 shadow-xl">
          <div className="mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            <h1 className="text-base font-semibold">{t('shell.webgl2RequiredTitle')}</h1>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('shell.webgl2RequiredDescription')}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
