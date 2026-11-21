import { describe, expect, it, vi } from 'vitest';
import { createSwController, type SwInstalledEvent, type WorkboxLike } from '@/pwa/registerSw';

class MockWorkbox implements WorkboxLike {
  private waitingListeners: Array<() => void> = [];
  private controllingListeners: Array<() => void> = [];
  private installedListeners: Array<(event: SwInstalledEvent) => void> = [];

  register = vi.fn(async () => undefined);
  update = vi.fn(async () => undefined);
  messageSkipWaiting = vi.fn(() => undefined);

  addEventListener(type: 'waiting' | 'controlling' | 'installed', listener: unknown): void {
    if (type === 'waiting') {
      this.waitingListeners.push(listener as () => void);
    } else if (type === 'controlling') {
      this.controllingListeners.push(listener as () => void);
    } else {
      this.installedListeners.push(listener as (event: SwInstalledEvent) => void);
    }
  }

  emitWaiting(): void {
    for (const fn of this.waitingListeners) fn();
  }

  emitControlling(): void {
    for (const fn of this.controllingListeners) fn();
  }

  emitInstalled(isUpdate: boolean): void {
    for (const fn of this.installedListeners) fn({ isUpdate });
  }
}

describe('createSwController', () => {
  it('notifies offlineReady only on initial install and handles waiting -> skipWaiting -> reload', async () => {
    const mockWb = new MockWorkbox();
    const onOfflineReady = vi.fn();
    const onNeedRefresh = vi.fn();
    const reload = vi.fn();

    const controller = createSwController({
      createWorkbox: () => mockWb,
      onOfflineReady,
      onNeedRefresh,
      reload,
    });

    expect(mockWb.register).toHaveBeenCalledTimes(1);

    mockWb.emitInstalled(false);
    expect(onOfflineReady).toHaveBeenCalledTimes(1);

    mockWb.emitInstalled(true);
    expect(onOfflineReady).toHaveBeenCalledTimes(1);

    mockWb.emitWaiting();
    expect(onNeedRefresh).toHaveBeenCalledTimes(1);
    const applyUpdate = onNeedRefresh.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(applyUpdate).toBeTypeOf('function');

    applyUpdate?.();
    applyUpdate?.();
    expect(mockWb.messageSkipWaiting).toHaveBeenCalledTimes(1);

    mockWb.emitControlling();
    expect(reload).toHaveBeenCalledTimes(1);

    await controller.checkForUpdate();
    expect(mockWb.update).toHaveBeenCalledTimes(1);
  });

  it('ignores events and update checks after dispose()', async () => {
    const mockWb = new MockWorkbox();
    const onNeedRefresh = vi.fn();
    const onOfflineReady = vi.fn();

    const controller = createSwController({
      createWorkbox: () => mockWb,
      onNeedRefresh,
      onOfflineReady,
    });

    controller.dispose();
    mockWb.emitInstalled(false);
    mockWb.emitWaiting();
    await controller.checkForUpdate();

    expect(onOfflineReady).not.toHaveBeenCalled();
    expect(onNeedRefresh).not.toHaveBeenCalled();
    expect(mockWb.update).not.toHaveBeenCalled();
  });
});
