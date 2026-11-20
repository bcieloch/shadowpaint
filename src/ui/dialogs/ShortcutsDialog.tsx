import { useMemo } from 'react';
import { Keyboard } from 'lucide-react';
import {
  formatShortcutKeys,
  isMacPlatform,
  SHORTCUT_GROUPS,
  type ShortcutCategoryId,
  type ShortcutItemId,
} from '@/core/shortcuts';
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

function KeyCombo({ tokens }: { tokens: readonly string[] }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {tokens.map((token, idx) => (
        <span key={`${token}-${idx}`} className="inline-flex items-center gap-0.5">
          {idx > 0 && <span className="text-muted-foreground text-[10px]">+</span>}
          <kbd className="border-border bg-background text-foreground inline-flex min-w-5 items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium shadow-2xs">
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

  const isMac = useMemo(() => isMacPlatform(), []);

  return (
    <Dialog open={open} onOpenChange={(v) => setDialogOpen('shortcutsOpen', v)}>
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
        </DialogHeader>

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
                    const primaryTokens = formatShortcutKeys(item.keys, isMac);
                    const altTokens = item.altKeys
                      ? formatShortcutKeys(item.altKeys, isMac)
                      : null;
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-foreground/90 min-w-0 truncate">
                          {t(`shortcuts.items.${item.id as ShortcutItemId}` as const)}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <KeyCombo tokens={primaryTokens} />
                          {altTokens && (
                            <>
                              <span className="text-muted-foreground text-[10px]">/</span>
                              <KeyCombo tokens={altTokens} />
                            </>
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

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDialogOpen('shortcutsOpen', false)}
            data-testid="shortcuts-close"
          >
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
