import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import {
  checkRestorableSession,
  discardRestorableSession,
  restoreProjectFromIndexedDb,
} from '@/persistence/autosave';
import type { ProjectRecord } from '@/persistence/db';
import { Button } from '@/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/ui/dialog';
import { useI18n } from '@/ui/hooks/useI18n';

export function RestoreSessionDialog() {
  const { locale, t } = useI18n();
  const [candidate, setCandidate] = useState<ProjectRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void checkRestorableSession()
      .then((rec) => {
        if (!cancelled && rec) {
          setCandidate(rec);
        }
      })
      .catch(() => {
        // Ignore IndexedDB unavailability during startup
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!candidate) return null;

  const displayName =
    candidate.name === 'Untitled' ? t('app.untitledProject') : candidate.name;
  const savedDate = new Date(candidate.updatedAt);
  const savedTime = Number.isNaN(savedDate.getTime())
    ? candidate.updatedAt
    : savedDate.toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

  const handleRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const restored = await restoreProjectFromIndexedDb(candidate.id);
      if (restored) {
        toast.success(t('restoreSession.restoredToast', { name: displayName }));
      } else {
        toast.error(t('restoreSession.restoreErrorToast'));
      }
    } catch {
      toast.error(t('restoreSession.restoreErrorToast'));
    } finally {
      setBusy(false);
      setCandidate(null);
    }
  };

  const handleStartNew = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await discardRestorableSession();
    } catch {
      // Ignore cleanup errors
    } finally {
      setBusy(false);
      setCandidate(null);
    }
  };

  return (
    <Dialog
      open={candidate !== null}
      onOpenChange={(open) => {
        if (!open) {
          void handleStartNew();
        }
      }}
    >
      <DialogContent className="bg-card text-foreground max-w-md" data-testid="restore-session-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="text-primary size-4" />
            <span>{t('restoreSession.title')}</span>
          </DialogTitle>
          <DialogDescription>{t('restoreSession.description')}</DialogDescription>
        </DialogHeader>

        <div className="border-border bg-background/70 space-y-1.5 rounded-md border p-3 text-xs">
          <p className="text-foreground font-medium" data-testid="restore-session-prompt">
            {t('restoreSession.prompt', { name: displayName, time: savedTime })}
          </p>
          <p className="text-muted-foreground font-mono text-[11px]">
            {t('restoreSession.dimensions', {
              wCm: candidate.settings.canvas.widthCm,
              hCm: candidate.settings.canvas.heightCm,
              wPx: candidate.settings.canvas.widthPx,
              hPx: candidate.settings.canvas.heightPx,
            })}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void handleStartNew()}
            data-testid="restore-session-discard"
          >
            {t('restoreSession.startNew')}
          </Button>
          <Button
            type="button"
            size="sm"
            autoFocus
            disabled={busy}
            onClick={() => void handleRestore()}
            data-testid="restore-session-confirm"
          >
            {t('restoreSession.restore')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
