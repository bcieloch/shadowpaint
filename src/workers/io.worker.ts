import { expose, transfer } from 'comlink';
import {
  buildExportPackageZip,
  encodeSingleExportArtifact,
  type ExportPackageInput,
  type SingleExportInput,
} from '@/export/package';

const ioWorkerApi = {
  ping(): string {
    return 'io-worker-ok';
  },

  exportPackage(
    input: Omit<ExportPackageInput, 'onProgress'>,
    onProgress?: (progress01: number) => void,
  ): Uint8Array {
    const zipBytes = buildExportPackageZip({ ...input, onProgress });
    return transfer(zipBytes, [zipBytes.buffer]);
  },

  exportSingleFile(
    input: Omit<SingleExportInput, 'onProgress'>,
    onProgress?: (progress01: number) => void,
  ): {
    bytes: Uint8Array;
    mimeType: string;
    filename: string;
  } {
    const result = encodeSingleExportArtifact({ ...input, onProgress });
    return transfer(result, [result.bytes.buffer]);
  },
};

export type IoWorkerApi = typeof ioWorkerApi;

expose(ioWorkerApi);
