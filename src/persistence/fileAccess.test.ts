import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearActiveFileHandle,
  getActiveFileHandle,
  getActiveFileName,
  pickAndSaveReliefFile,
  pickReliefFileWithFsAccess,
  setActiveFileHandle,
  supportsFileSystemAccess,
  writeBytesToFileHandle,
  type FsAccessWindowLike,
  type ReliefFileHandle,
} from '@/persistence/fileAccess';

function createMockHandle(name: string, sink: Uint8Array[] = [], file?: File): ReliefFileHandle {
  return {
    name,
    createWritable: async () => ({
      write: async (data) => {
        if (data instanceof Uint8Array) {
          sink.push(new Uint8Array(data));
        }
      },
      close: async () => {},
    }),
    getFile: async () => file ?? new File([new Uint8Array([1, 2, 3])], name),
  };
}

describe('fileAccess', () => {
  beforeEach(() => {
    clearActiveFileHandle();
  });

  it('tracks active file handle and clears on reset', () => {
    const handle = createMockHandle('painting.relief');
    expect(getActiveFileHandle()).toBeNull();
    setActiveFileHandle(handle);
    expect(getActiveFileHandle()).toBe(handle);
    expect(getActiveFileName()).toBe('painting.relief');
    clearActiveFileHandle();
    expect(getActiveFileHandle()).toBeNull();
    expect(getActiveFileName()).toBeNull();
  });

  it('detects FS Access availability from window-like object', () => {
    expect(supportsFileSystemAccess({})).toBe(false);
    expect(
      supportsFileSystemAccess({
        showOpenFilePicker: async () => [],
        showSaveFilePicker: async () => createMockHandle('x.relief'),
      }),
    ).toBe(true);
  });

  it('writes bytes through FileSystemFileHandle cleanly', async () => {
    const written: Uint8Array[] = [];
    const handle = createMockHandle('scene.relief', written);
    const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    await writeBytesToFileHandle(handle, payload);
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual(payload);
  });

  it('saves via FS Access picker and handles cancellation cleanly', async () => {
    const written: Uint8Array[] = [];
    const handle = createMockHandle('saved.relief', written);
    const fsWin: FsAccessWindowLike = {
      showSaveFilePicker: async () => handle,
      showOpenFilePicker: async () => [handle],
    };

    const res = await pickAndSaveReliefFile('default.relief', new Uint8Array([9, 8, 7]), {
      fsWindow: fsWin,
      allowFsAccess: true,
    });
    expect(res).toEqual({ status: 'saved-fs', handle, fileName: 'saved.relief' });
    expect(written[0]).toEqual(new Uint8Array([9, 8, 7]));

    const abortWin: FsAccessWindowLike = {
      showSaveFilePicker: async () => {
        throw new DOMException('Cancelled', 'AbortError');
      },
      showOpenFilePicker: async () => [],
    };
    const cancelled = await pickAndSaveReliefFile('default.relief', new Uint8Array([1]), {
      fsWindow: abortWin,
      allowFsAccess: true,
    });
    expect(cancelled).toEqual({ status: 'cancelled' });
  });

  it('picks a file via showOpenFilePicker or handles AbortError', async () => {
    const expectedFile = new File([new Uint8Array([0x50, 0x4b])], 'study.relief');
    const handle = createMockHandle('study.relief', [], expectedFile);

    const picked = await pickReliefFileWithFsAccess({
      fsWindow: {
        showOpenFilePicker: async () => [handle],
        showSaveFilePicker: async () => handle,
      },
      allowFsAccess: true,
    });
    expect(picked.status).toBe('picked');
    if (picked.status === 'picked') {
      expect(picked.file).toBe(expectedFile);
      expect(picked.handle).toBe(handle);
    }

    const spyCreate = vi.spyOn(document, 'createElement');
    const unsupported = await pickReliefFileWithFsAccess({ fsWindow: {}, allowFsAccess: false });
    expect(unsupported).toEqual({ status: 'unsupported' });
    spyCreate.mockRestore();
  });
});
