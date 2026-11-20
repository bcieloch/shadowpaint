import { AUTHOR_NAME, IDEA_AUTHOR_NAME } from '@/core/constants';
import { useReadoutStore } from '@/state/readoutStore';
import { useUiStore } from '@/state/uiStore';
import { useI18n } from '@/ui/hooks/useI18n';
import { TaskProgress } from '@/ui/widgets/TaskProgress';

export function StatusBar() {
  const { t } = useI18n();
  const statusMessage = useUiStore((s) => s.statusMessage);
  const readout = useReadoutStore((s) => s.readout);

  return (
    <footer className="border-border bg-card text-muted-foreground flex h-[26px] shrink-0 items-center justify-between gap-3 overflow-hidden border-t px-3 font-mono text-[11px] select-none">
      <div className="flex min-w-0 items-center gap-3">
        {statusMessage ? (
          <span data-testid="statusbar-message" className="shrink-0 font-medium text-amber-400">
            {t(statusMessage.key, statusMessage.params)}
          </span>
        ) : (
          <span
            data-testid="statusbar-message"
            className={readout ? 'sr-only' : 'text-muted-foreground shrink-0'}
          >
            {t('shell.statusBarReady')}
          </span>
        )}

        {readout && (
          <div
            data-testid="statusbar-readout"
            className="text-foreground/90 flex min-w-0 items-center gap-2 truncate"
          >
            <span data-testid="readout-coords" className="whitespace-nowrap">
              {t('shell.readoutCoords', {
                xPx: readout.xPx,
                xCm: readout.xCm.toFixed(2),
                yPx: readout.yPx,
                yCm: readout.yCm.toFixed(2),
              })}
            </span>
            <span className="text-border">|</span>
            <span
              data-testid="readout-rgb"
              className="inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span
                className="border-border inline-block size-2.5 shrink-0 rounded-[2px] border"
                style={{ backgroundColor: readout.hex }}
                aria-hidden="true"
              />
              {t('shell.readoutRgb', { hex: readout.hex })}
            </span>
            <span className="text-border">|</span>
            <span data-testid="readout-height" className="whitespace-nowrap">
              {t('shell.readoutHeight', {
                mm: readout.heightMm.toFixed(3),
                level: readout.level8,
                mmL: readout.heightMmQuantized.toFixed(3),
              })}
            </span>
            <span className="text-border">|</span>
            <span data-testid="readout-opacity" className="whitespace-nowrap">
              {t('shell.readoutOpacity', { pct: readout.opacityPct.toFixed(1) })}
            </span>
            <span className="text-border">|</span>
            <span data-testid="readout-back-t" className="whitespace-nowrap text-sky-400">
              {t('shell.readoutBackT', { pct: readout.backTransmissionPct.toFixed(1) })}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <TaskProgress />
        {!readout && (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span data-testid="statusbar-credits" className="hidden lg:inline">
              {t('app.creditsInline', { author: AUTHOR_NAME, idea: IDEA_AUTHOR_NAME })}
            </span>
            <span className="text-border hidden xl:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden xl:inline">{t('app.tagline')}</span>
          </div>
        )}
      </div>
    </footer>
  );
}
