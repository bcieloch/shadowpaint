import { AlertTriangle } from 'lucide-react';
import {
  cancelPendingOpenRelief,
  performOpenReliefFile,
} from '@/services/fileService';
import { useUiStore } from '@/state/uiStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/ui/alert-dialog';
import { useI18n } from '@/ui/hooks/useI18n';

export function ConfirmUnsavedDialog() {
  const { t } = useI18n();
  const pending = useUiStore((s) => s.pendingOpenRelief);

  const handleConfirm = () => {
    if (!pending) return;
    const { file, handle } = pending;
    cancelPendingOpenRelief();
    void performOpenReliefFile(file, handle);
  };

  return (
    <AlertDialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open) {
          cancelPendingOpenRelief();
        }
      }}
    >
      <AlertDialogContent data-testid="confirm-unsaved-open-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-primary size-4" />
            <span>{t('projectFile.confirmUnsavedTitle')}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('projectFile.confirmUnsavedDescription', {
              file: pending?.file.name ?? '',
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            data-testid="confirm-unsaved-open-cancel"
            onClick={() => cancelPendingOpenRelief()}
          >
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            data-testid="confirm-unsaved-open-proceed"
            onClick={handleConfirm}
          >
            {t('projectFile.confirmUnsavedAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
