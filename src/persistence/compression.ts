import { transfer } from 'comlink';
import { deflateBytesSync, inflateBytesSync } from '@/persistence/codec';
import { getIoWorker } from '@/workers/client';

export { deflateBytesSync, inflateBytesSync };

export async function compressBytes(bytes: Uint8Array, level = 1): Promise<Uint8Array> {
  if (typeof Worker !== 'undefined') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const worker = getIoWorker();
    return await worker.deflateBytes(transfer(copy, [copy.buffer]), level);
  }
  return deflateBytesSync(bytes, level);
}

export async function decompressBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof Worker !== 'undefined') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const worker = getIoWorker();
    return await worker.inflateBytes(transfer(copy, [copy.buffer]));
  }
  return inflateBytesSync(bytes);
}
