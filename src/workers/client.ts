import { wrap, type Remote } from 'comlink';
import type { DecodedAssetResult, ImageWorkerApi } from '@/workers/image.worker';
import type { IoWorkerApi } from '@/workers/io.worker';

export type { DecodedAssetResult };

let imageProxy: Remote<ImageWorkerApi> | null = null;
let ioProxy: Remote<IoWorkerApi> | null = null;

export function getImageWorker(): Remote<ImageWorkerApi> {
  if (!imageProxy) {
    const worker = new Worker(new URL('./image.worker.ts', import.meta.url), {
      type: 'module',
    });
    imageProxy = wrap<ImageWorkerApi>(worker);
  }
  return imageProxy;
}

export function getIoWorker(): Remote<IoWorkerApi> {
  if (!ioProxy) {
    const worker = new Worker(new URL('./io.worker.ts', import.meta.url), {
      type: 'module',
    });
    ioProxy = wrap<IoWorkerApi>(worker);
  }
  return ioProxy;
}
