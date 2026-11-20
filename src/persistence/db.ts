import Dexie, { type Table } from 'dexie';
import {
  clampPanelSizesForBreakpoint,
  isRightTabId,
  type UiLayoutPreference,
} from '@/core/layout';
import type { ProjectSettings } from '@/core/types';
import { clampSplitRatio } from '@/editor2d/splitLayout';

export type { UiLayoutPreference };

export type BlobKey =
  | 'color.base'
  | 'color.working'
  | 'height.base'
  | 'height.working'
  | 'opacity.base'
  | 'opacity.working'
  | 'selection';

export const ALL_BLOB_KEYS: readonly BlobKey[] = [
  'color.base',
  'color.working',
  'height.base',
  'height.working',
  'opacity.base',
  'opacity.working',
  'selection',
];

export type BlobDtype = 'rgba8' | 'float32' | 'uint8';
export type StoredBinaryPayload = Blob | Uint8Array;

export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: string;
  settings: ProjectSettings;
  thumbnail: StoredBinaryPayload;
  sizeBytes: number;
}

export interface BlobRecord {
  projectId: string;
  key: BlobKey;
  dtype: BlobDtype;
  width: number;
  height: number;
  data: StoredBinaryPayload;
  updatedAt: string;
}

export type MetaKey = 'lastProjectId' | 'historyLimitMb' | 'uiLayout' | 'locale';

export interface MetaRecord {
  key: MetaKey;
  value: unknown;
}

export class ShadowPaintDb extends Dexie {
  projects!: Table<ProjectRecord, string>;
  blobs!: Table<BlobRecord, [string, BlobKey]>;
  meta!: Table<MetaRecord, MetaKey>;

  constructor(name = 'shadowpaint') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt, name',
      blobs: '[projectId+key], projectId',
      meta: 'key',
    });
  }
}

export const db = new ShadowPaintDb();

const SUPPORTS_STRUCTURED_CLONE_BLOB = (() => {
  try {
    if (typeof Blob === 'undefined' || typeof structuredClone !== 'function') return false;
    const cloned = structuredClone(new Blob([new Uint8Array([1, 2, 3])]));
    return cloned instanceof Blob && cloned.size === 3;
  } catch {
    return false;
  }
})();

export function bytesToStoredPayload(
  bytes: Uint8Array,
  mimeType = 'application/octet-stream',
): StoredBinaryPayload {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  if (SUPPORTS_STRUCTURED_CLONE_BLOB) {
    return new Blob([copy], { type: mimeType });
  }
  return copy;
}

export function getStoredPayloadSize(payload: StoredBinaryPayload | null | undefined): number {
  if (!payload) return 0;
  if (payload instanceof Uint8Array) return payload.byteLength;
  if (ArrayBuffer.isView(payload)) return payload.byteLength;
  return payload.size ?? 0;
}

export async function readStoredPayloadAsUint8Array(
  payload: StoredBinaryPayload,
): Promise<Uint8Array> {
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (typeof payload.arrayBuffer === 'function') {
    const ab = await payload.arrayBuffer();
    return new Uint8Array(ab);
  }
  if (typeof FileReader !== 'undefined') {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(new Uint8Array(reader.result as ArrayBuffer));
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error('Failed to read Blob'));
      };
      reader.readAsArrayBuffer(payload);
    });
  }
  const ab = await new Response(payload).arrayBuffer();
  return new Uint8Array(ab);
}

export async function getMetaValue<T>(
  key: MetaKey,
  database: ShadowPaintDb = db,
): Promise<T | undefined> {
  const rec = await database.meta.get(key);
  return rec ? (rec.value as T) : undefined;
}

export async function setMetaValue<T>(
  key: MetaKey,
  value: T,
  database: ShadowPaintDb = db,
): Promise<void> {
  await database.meta.put({ key, value });
}

export async function deleteMetaValue(
  key: MetaKey,
  database: ShadowPaintDb = db,
): Promise<void> {
  await database.meta.delete(key);
}

export function sanitizeUiLayout(raw: unknown): UiLayoutPreference {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: UiLayoutPreference = {};

  const hasLeft = typeof obj.leftPanelSize === 'number' && Number.isFinite(obj.leftPanelSize);
  const hasRight = typeof obj.rightPanelSize === 'number' && Number.isFinite(obj.rightPanelSize);
  if (hasLeft || hasRight) {
    const clamped = clampPanelSizesForBreakpoint(
      {
        leftPanelSize: hasLeft ? (obj.leftPanelSize as number) : undefined,
        rightPanelSize: hasRight ? (obj.rightPanelSize as number) : undefined,
      },
      'desktop',
    );
    if (hasLeft) out.leftPanelSize = clamped.leftPanelSize;
    if (hasRight) out.rightPanelSize = clamped.rightPanelSize;
  }

  if (typeof obj.panelsHidden === 'boolean') {
    out.panelsHidden = obj.panelsHidden;
  }
  if (typeof obj.splitRatio === 'number' && Number.isFinite(obj.splitRatio)) {
    out.splitRatio = clampSplitRatio(obj.splitRatio);
  }
  if (isRightTabId(obj.rightTab)) {
    out.rightTab = obj.rightTab;
  }

  return out;
}

export async function getUiLayout(
  database: ShadowPaintDb = db,
): Promise<UiLayoutPreference> {
  if (typeof indexedDB === 'undefined') return {};
  try {
    const stored = await getMetaValue<unknown>('uiLayout', database);
    return sanitizeUiLayout(stored);
  } catch {
    return {};
  }
}

export async function saveUiLayout(
  patch: UiLayoutPreference,
  database: ShadowPaintDb = db,
): Promise<UiLayoutPreference> {
  const cleanPatch = sanitizeUiLayout(patch);
  if (typeof indexedDB === 'undefined') {
    return cleanPatch;
  }
  try {
    const existing = await getUiLayout(database);
    const merged: UiLayoutPreference = { ...existing, ...cleanPatch };
    await setMetaValue('uiLayout', merged, database);
    return merged;
  } catch {
    return cleanPatch;
  }
}

export async function listRecentProjects(
  database: ShadowPaintDb = db,
): Promise<ProjectRecord[]> {
  return await database.projects.orderBy('updatedAt').reverse().toArray();
}

export async function deleteProjectFromDb(
  projectId: string,
  database: ShadowPaintDb = db,
): Promise<void> {
  await database.transaction('rw', database.projects, database.blobs, database.meta, async () => {
    await database.blobs.where('projectId').equals(projectId).delete();
    await database.projects.delete(projectId);
    const lastId = await database.meta.get('lastProjectId');
    if (lastId?.value === projectId) {
      await database.meta.delete('lastProjectId');
    }
  });
}

export function isQuotaExceededError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const obj = current as { name?: string; message?: string; inner?: unknown; cause?: unknown };
    if (obj.name === 'QuotaExceededError') return true;
    if (typeof obj.message === 'string' && /quotaexceeded/i.test(obj.message)) return true;
    current = obj.inner ?? obj.cause;
  }
  return false;
}
