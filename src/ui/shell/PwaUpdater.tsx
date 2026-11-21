import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createTranslator } from '@/i18n';
import { useLocaleStore } from '@/i18n/localeStore';
import { registerAppServiceWorker } from '@/pwa/registerSw';
import { useI18n } from '@/ui/hooks/useI18n';

const UPDATE_TOAST_ID = 'shadowpaint-pwa-update';

export function PwaUpdater() {
  const { t } = useI18n();
  const [pendingApply, setPendingApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    const controller = registerAppServiceWorker({
      onNeedRefresh: (applyUpdate) => {
        setPendingApply(() => applyUpdate);
      },
      onOfflineReady: () => {
        const tr = createTranslator(useLocaleStore.getState().locale);
        toast.success(tr('pwa.offlineReady'), {
          id: 'shadowpaint-pwa-offline-ready',
          duration: 4000,
        });
      },
    });

    return () => {
      controller.dispose();
    };
  }, []);

  useEffect(() => {
    if (!pendingApply) return;
    toast.info(t('pwa.updateTitle'), {
      id: UPDATE_TOAST_ID,
      description: t('pwa.updateDescription'),
      duration: Infinity,
      action: {
        label: t('pwa.reloadButton'),
        onClick: () => {
          pendingApply();
          setPendingApply(null);
        },
      },
      onDismiss: () => {
        setPendingApply(null);
      },
    });
  }, [pendingApply, t]);

  return null;
}
