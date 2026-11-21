import { Workbox } from 'workbox-window';

export interface SwInstalledEvent {
  isUpdate?: boolean;
}

export interface WorkboxLike {
  addEventListener(type: 'waiting' | 'controlling', listener: () => void): void;
  addEventListener(type: 'installed', listener: (event: SwInstalledEvent) => void): void;
  register(): Promise<ServiceWorkerRegistration | undefined>;
  update(): Promise<void>;
  messageSkipWaiting(): void;
}

export interface SwControllerOptions {
  createWorkbox?: () => WorkboxLike;
  onNeedRefresh?: (applyUpdate: () => void) => void;
  onOfflineReady?: () => void;
  onRegistrationError?: (error: unknown) => void;
  reload?: () => void;
}

export interface SwController {
  applyUpdate: () => void;
  checkForUpdate: () => Promise<void>;
  dispose: () => void;
}

export function createSwController(options: SwControllerOptions = {}): SwController {
  const wb: WorkboxLike = options.createWorkbox
    ? options.createWorkbox()
    : (new Workbox('./sw.js', { scope: './' }) as unknown as WorkboxLike);
  const reload = options.reload ?? (() => window.location.reload());

  let disposed = false;
  let reloadScheduled = false;

  const applyUpdate = () => {
    if (disposed || reloadScheduled) return;
    reloadScheduled = true;
    wb.addEventListener('controlling', () => {
      if (!disposed) {
        reload();
      }
    });
    wb.messageSkipWaiting();
  };

  wb.addEventListener('waiting', () => {
    if (!disposed) {
      options.onNeedRefresh?.(applyUpdate);
    }
  });

  wb.addEventListener('installed', (event) => {
    if (!disposed && event.isUpdate !== true) {
      options.onOfflineReady?.();
    }
  });

  void wb.register().catch((err: unknown) => {
    if (!disposed) {
      options.onRegistrationError?.(err);
    }
  });

  return {
    applyUpdate,
    checkForUpdate: async () => {
      if (disposed) return;
      try {
        await wb.update();
      } catch (err: unknown) {
        options.onRegistrationError?.(err);
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
}

export function registerAppServiceWorker(
  options: Omit<SwControllerOptions, 'createWorkbox' | 'reload'> & { enabled?: boolean } = {},
): SwController {
  const enabled = options.enabled ?? import.meta.env.PROD;
  if (!enabled || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return {
      applyUpdate: () => undefined,
      checkForUpdate: async () => undefined,
      dispose: () => undefined,
    };
  }

  const controller = createSwController(options);

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      void controller.checkForUpdate();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return {
    applyUpdate: controller.applyUpdate,
    checkForUpdate: controller.checkForUpdate,
    dispose: () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      controller.dispose();
    },
  };
}
