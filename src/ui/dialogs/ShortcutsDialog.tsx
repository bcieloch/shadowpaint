import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Keyboard, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  eventToShortcutTokens,
  findConflictingShortcutId,
  formatShortcutKeys,
  getEffectiveShortcutKeys,
  isMacPlatform,
  isShortcutCustomized,
  SHORTCUT_GROUPS,
  type ShortcutCategoryId,
  type ShortcutItemId,
} from '@/core/shortcuts';
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

function KeyCombo({
  tokens,
  customized = false,
}: {
  tokens: readonly string[];
  customized?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {tokens.map((token, idx) => (
        <span key={`${token}-${idx}`} className="inline-flex items-center gap-0.5">
          {idx > 0 && <span className="text-muted-foreground text-[10px]">+</span>}
          <kbd
            className={`inline-flex min-w-5 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium shadow-2xs ${
              customized
                ? 'border-primary/60 bg-primary/10 text-primary'
                : 'border-border bg-background text-foreground'
            }`}
          >
            {token}
          </kbd>
        </span>
      ))}
    </span>
  );
}

export function ShortcutsDialog() {
  const { t } = useI18n();
  const open = useUiStore((s) => s.dialogs.shortcutsOpen);
  const setDialogOpen = useUiStore((s) => s.setDialogOpen);

  const customShortcuts = useEditorStore((s) => s.customShortcuts);
  const setCustomShortcut = useEditorStore((s) => s.setCustomShortcut);
  const resetCustomShortcut = useEditorStore((s) => s.resetCustomShortcut);
  const resetAllCustomShortcuts = useEditorStore((s) => s.resetAllCustomShortcuts);

  const [recordingId, setRecordingId] = useState<ShortcutItemId | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const isMac = useMemo(() => isMacPlatform(), []);
  const hasAnyCustom = Object.keys(customShortcuts).length > 0;

  useEffect(() => {
    if (!open || !recordingId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingId(null);
        return;
      }

      const tokens = eventToShortcutTokens(e);
      if (!tokens) return;

      const conflictId = findConflictingShortcutId(recordingId, tokens, customShortcuts);
      const combo = formatShortcutKeys(tokens, isMac).join('+');

      if (conflictId) {
        const msg = t('shortcuts.conflictError', {
          combo,
          action: t(`shortcuts.items.${conflictId}` as const),
        });
        setConflictMessage(msg);
        toast.error(msg);
        setRecordingId(null);
        return;
      }

      setCustomShortcut(recordingId, tokens);
      setConflictMessage(null);
      setRecordingId(null);
      toast.success(
        t('shortcuts.updatedToast', {
          action: t(`shortcuts.items.${recordingId}` as const),
          combo,
        }),
      );
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [customShortcuts, isMac, open, recordingId, setCustomShortcut, t]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setRecordingId(null);
      setConflictMessage(null);
    }
    setDialogOpen('shortcutsOpen', nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="bg-card text-foreground flex max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl"
        data-testid="shortcuts-dialog"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="text-primary size-4" aria-hidden="true" />
            <span>{t('shortcuts.dialogTitle')}</span>
          </DialogTitle>
          <DialogDescription>{t('shortcuts.dialogDescription')}</DialogDescription>
          <p className="text-muted-foreground text-[11px]">{t('shortcuts.customizeHint')}</p>
        </DialogHeader>

        {conflictMessage && (
          <div
            className="border-destructive/40 bg-destructive/10 text-destructive flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs"
            role="alert"
            data-testid="shortcut-conflict-alert"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{conflictMessage}</span>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1 overflow-hidden pr-2">
          <div className="grid grid-cols-1 gap-4 py-1 md:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => (
              <section
                key={group.id}
                className="border-border bg-background/50 space-y-2 rounded-md border p-3"
                data-testid={`shortcuts-group-${group.id}`}
              >
                <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                  {t(`shortcuts.categories.${group.id as ShortcutCategoryId}` as const)}
                </h3>
                <ul className="space-y-1.5">
                  {group.items.map((item) => {
                    const customized = isShortcutCustomized(item.id, customShortcuts);
                    const effectiveKeys = getEffectiveShortcutKeys(item.id, customShortcuts);
                    const primaryTokens = formatShortcutKeys(effectiveKeys, isMac);
                    const altTokens =
                      !customized && item.altKeys
                        ? formatShortcutKeys(item.altKeys, isMac)
                        : null;
                    const isRecording = recordingId === item.id;
                    const label = t(`shortcuts.items.${item.id as ShortcutItemId}` as const);

                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-xs"
                        data-testid={`shortcut-row-${item.id}`}
                      >
                        <span className="text-foreground/90 min-w-0 truncate">{label}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {item.customizable ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setConflictMessage(null);
                                  setRecordingId(isRecording ? null : item.id);
                                }}
                                aria-label={t('shortcuts.recordButton', { action: label })}
                                data-testid={`shortcut-bind-${item.id}`}
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                                  isRecording
                                    ? 'border-primary bg-primary/15 text-primary ring-primary/40 border font-mono text-[10px] font-semibold ring-2'
                                    : 'hover:bg-accent/70 cursor-pointer'
                                }`}
                              >
                                {isRecording ? (
                                  <span>{t('shortcuts.pressKeys')}</span>
                                ) : (
                                  <>
                                    <KeyCombo tokens={primaryTokens} customized={customized} />
                                    {altTokens && (
                                      <>
                                        <span className="text-muted-foreground text-[10px]">
                                          /
                                        </span>
                                        <KeyCombo tokens={altTokens} />
                                      </>
                                    )}
                                  </>
                                )}
                              </button>
                              {customized && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    resetCustomShortcut(item.id);
                                    setConflictMessage(null);
                                  }}
                                  title={t('shortcuts.resetItem')}
                                  aria-label={`${t('shortcuts.resetItem')}: ${label}`}
                                  data-testid={`shortcut-reset-${item.id}`}
                                  className="text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors"
                                >
                                  <RotateCcw className="size-3" aria-hidden="true" />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 opacity-80">
                              <KeyCombo tokens={primaryTokens} />
                              {altTokens && (
                                <>
                                  <span className="text-muted-foreground text-[10px]">/</span>
                                  <KeyCombo tokens={altTokens} />
                                </>
                              )}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex shrink-0 items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasAnyCustom}
            onClick={() => {
              resetAllCustomShortcuts();
              setRecordingId(null);
              setConflictMessage(null);
              toast.success(t('shortcuts.resetAllToast'));
            }}
            data-testid="shortcuts-reset-all"
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span>{t('shortcuts.resetAll')}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            data-testid="shortcuts-close"
          >
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
