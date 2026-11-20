import { expose, transfer } from 'comlink';
import {
  buildExportPackageZip,
  encodeSingleExportArtifact,
  type ExportPackageInput,
  type SingleExportInput,
} from '@/export/package';
import { deflateBytesSync, inflateBytesSync } from '@/persistence/codec';
import { packReliefProject, type PackReliefProjectInput } from '@/persistence/projectArchive';
import { encodeThumbnailPngSync } from '@/persistence/thumbnail';

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

  deflateBytes(bytes: Uint8Array, level = 1): Uint8Array {
    const compressed = deflateBytesSync(bytes, level);
    return transfer(compressed, [compressed.buffer]);
  },

  inflateBytes(bytes: Uint8Array): Uint8Array {
    const raw = inflateBytesSync(bytes);
    return transfer(raw, [raw.buffer]);
  },

  encodeThumbnailPng(
    rgba: Uint8Array,
    width: number,
    height: number,
    maxLongestSide = 512,
  ): Uint8Array {
    const png = encodeThumbnailPngSync(rgba, width, height, maxLongestSide);
    return transfer(png, [png.buffer]);
  },

  packReliefProject(
    input: Omit<PackReliefProjectInput, 'onProgress'>,
    onProgress?: (progress01: number) => void,
  ): Uint8Array {
    const zipBytes = packReliefProject({ ...input, onProgress });
    return transfer(zipBytes, [zipBytes.buffer]);
  },
};

export type IoWorkerApi = typeof ioWorkerApi;

expose(ioWorkerApi);
