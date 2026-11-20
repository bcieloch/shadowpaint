import { triggerDownload } from '@/lib/download';

export interface ReliefFileWritableStream {
  write: (data: Uint8Array | Blob | string) => Promise<void>;
  close: () => Promise<void>;
}

export interface ReliefFileHandle {
  readonly name: string;
  createWritable: () => Promise<ReliefFileWritableStream>;
  getFile?: () => Promise<File>;
}

export interface SavePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
}

export interface OpenPickerOptions {
  multiple?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
}

export interface FsAccessWindowLike {
  showSaveFilePicker?: (options?: SavePickerOptions) => Promise<ReliefFileHandle>;
  showOpenFilePicker?: (options?: OpenPickerOptions) => Promise<ReliefFileHandle[]>;
}

let activeFileHandle: ReliefFileHandle | null = null;
let activeFileName: string | null = null;

export function getActiveFileHandle(): ReliefFileHandle | null {
  return activeFileHandle;
}

export function getActiveFileName(): string | null {
  return activeFileName;
}

export function setActiveFileHandle(
  handle: ReliefFileHandle | null,
  fileName: string | null = handle?.name ?? null,
): void {
  activeFileHandle = handle;
  activeFileName = fileName;
}

export function clearActiveFileHandle(): void {
  activeFileHandle = null;
  activeFileName = null;
}

export function supportsFileSystemAccess(fsWindow?: FsAccessWindowLike): boolean {
  if (!fsWindow) {
    if (typeof window === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
      return false;
    }
    const win = window as unknown as FsAccessWindowLike;
    return typeof win.showSaveFilePicker === 'function' && typeof win.showOpenFilePicker === 'function';
  }
  return (
    typeof fsWindow.showSaveFilePicker === 'function' &&
    typeof fsWindow.showOpenFilePicker === 'function'
  );
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return err instanceof Error && err.name === 'AbortError';
}

export async function writeBytesToFileHandle(
  handle: ReliefFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    const safeBytes = new Uint8Array(bytes.byteLength);
    safeBytes.set(bytes);
    await writable.write(safeBytes);
  } finally {
    await writable.close();
  }
}

export type SaveReliefResult =
  | { status: 'saved-fs'; handle: ReliefFileHandle; fileName: string }
  | { status: 'downloaded'; fileName: string }
  | { status: 'cancelled' };

const RELIEF_FILE_TYPES: NonNullable<SavePickerOptions['types']> = [
  {
    description: 'ShadowPaint Project (.relief)',
    accept: {
      'application/zip': ['.relief', '.zip'],
    },
  },
];

export async function pickAndSaveReliefFile(
  suggestedName: string,
  bytes: Uint8Array,
  options: {
    forceDownload?: boolean;
    fsWindow?: FsAccessWindowLike;
    allowFsAccess?: boolean;
  } = {},
): Promise<SaveReliefResult> {
  const fsWin =
    options.fsWindow ??
    (typeof window !== 'undefined' ? (window as unknown as FsAccessWindowLike) : undefined);
  const canUseFs =
    !options.forceDownload && (options.allowFsAccess ?? supportsFileSystemAccess(options.fsWindow));

  if (canUseFs && fsWin?.showSaveFilePicker) {
    let handle: ReliefFileHandle;
    try {
      handle = await fsWin.showSaveFilePicker({
        suggestedName,
        types: RELIEF_FILE_TYPES,
      });
    } catch (err) {
      if (isAbortError(err)) {
        return { status: 'cancelled' };
      }
      throw err;
    }
    await writeBytesToFileHandle(handle, bytes);
    return {
      status: 'saved-fs',
      handle,
      fileName: handle.name || suggestedName,
    };
  }

  triggerDownload(bytes, 'application/zip', suggestedName);
  return { status: 'downloaded', fileName: suggestedName };
}

export type OpenReliefPickerResult =
  | { status: 'picked'; file: File; handle: ReliefFileHandle }
  | { status: 'cancelled' }
  | { status: 'unsupported' };

export async function pickReliefFileWithFsAccess(
  options: {
    fsWindow?: FsAccessWindowLike;
    allowFsAccess?: boolean;
  } = {},
): Promise<OpenReliefPickerResult> {
  const fsWin =
    options.fsWindow ??
    (typeof window !== 'undefined' ? (window as unknown as FsAccessWindowLike) : undefined);
  const canUseFs = options.allowFsAccess ?? supportsFileSystemAccess(options.fsWindow);

  if (!canUseFs || !fsWin?.showOpenFilePicker) {
    return { status: 'unsupported' };
  }

  let handles: ReliefFileHandle[];
  try {
    handles = await fsWin.showOpenFilePicker({
      multiple: false,
      types: RELIEF_FILE_TYPES,
    });
  } catch (err) {
    if (isAbortError(err)) {
      return { status: 'cancelled' };
    }
    throw err;
  }

  const handle = handles[0];
  if (!handle || typeof handle.getFile !== 'function') {
    return { status: 'cancelled' };
  }

  const file = await handle.getFile();
  return { status: 'picked', file, handle };
}
