import { wrap, type Remote } from 'comlink';
import type { DecodedAssetResult, ImageWorkerApi } from '@/workers/image.worker';
import type { IoWorkerApi } from '@/workers/io.worker';

export type { DecodedAssetResult };

interface WorkerSlot<T> {
  worker: Worker;
  proxy: Remote<T>;
}

const imagePool: WorkerSlot<ImageWorkerApi>[] = [];
let ioSlot: WorkerSlot<IoWorkerApi> | null = null;

function createImageSlot(): WorkerSlot<ImageWorkerApi> {
  const worker = new Worker(new URL('./image.worker.ts', import.meta.url), {
    type: 'module',
  });
  return {
    worker,
    proxy: wrap<ImageWorkerApi>(worker),
  };
}

export function getImageWorker(): Remote<ImageWorkerApi> {
  return getImageWorkerPoolSlot(0);
}

export function getImageWorkerPoolSlot(index: number): Remote<ImageWorkerApi> {
  const idx = Math.max(0, Math.floor(index));
  while (imagePool.length <= idx) {
    imagePool.push(createImageSlot());
  }
  return (imagePool[idx] as WorkerSlot<ImageWorkerApi>).proxy;
}

export function getActiveImageWorkerCount(): number {
  return imagePool.length;
}

export function terminateImageWorkerPool(): void {
  for (const slot of imagePool) {
    slot.worker.terminate();
  }
  imagePool.length = 0;
}

export function getIoWorker(): Remote<IoWorkerApi> {
  if (!ioSlot) {
    const worker = new Worker(new URL('./io.worker.ts', import.meta.url), {
      type: 'module',
    });
    ioSlot = {
      worker,
      proxy: wrap<IoWorkerApi>(worker),
    };
  }
  return ioSlot.proxy;
}
