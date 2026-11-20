import { expose, transfer } from 'comlink';
import {
  buildExportPackageZip,
  encodeSingleExportArtifact,
  type ExportPackageInput,
  type SingleExportInput,
} from '@/export/package';
import { deflateBytesSync, inflateBytesSync } from '@/persistence/codec';
import {
  packReliefProject,
  unpackReliefProject,
  type PackReliefProjectInput,
  type UnpackedReliefProject,
} from '@/persistence/projectArchive';
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

  unpackReliefProject(
    zipBytes: Uint8Array,
    onProgress?: (progress01: number) => void,
  ): UnpackedReliefProject {
    const unpacked = unpackReliefProject(zipBytes, onProgress);
    return transfer(unpacked, [
      unpacked.colorBase.buffer,
      unpacked.colorWorking.buffer,
      unpacked.colorEffective.buffer,
      unpacked.heightBase.buffer,
      unpacked.heightWorking.buffer,
      unpacked.heightEffective.buffer,
      unpacked.opacityBase.buffer,
      unpacked.opacityWorking.buffer,
      unpacked.opacityEffective.buffer,
      unpacked.selection.buffer,
    ]);
  },
};

export type IoWorkerApi = typeof ioWorkerApi;

expose(ioWorkerApi);
