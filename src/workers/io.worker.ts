import { expose } from 'comlink';

const ioWorkerApi = {
  ping(): string {
    return 'io-worker-ok';
  },
};

export type IoWorkerApi = typeof ioWorkerApi;

expose(ioWorkerApi);
