import { proxy, transfer } from 'comlink';
import {
  applyColorAdjustments,
  applyHeightAdjustments,
  applyOpacityAdjustments,
} from '@/core/maps/adjustments';
import { flushEffectiveMap } from '@/core/maps/dirtyTiles';
import { mapRegistry, type MapRegistry } from '@/core/maps/MapRegistry';
import type { MapId, ProjectSettings } from '@/core/types';
import { asUint8Array, float32ToLittleEndianBytes, littleEndianBytesToFloat32, uint8ToClampedRgba } from '@/lib/bytes';
import { sanitizeExportSlug, triggerDownload } from '@/lib/download';
import { compressBytes, decompressBytes } from '@/persistence/compression';
import {
  ALL_BLOB_KEYS,
  bytesToStoredPayload,
  getStoredPayloadSize,
  db,
  deleteMetaValue,
  isQuotaExceededError,
  readStoredPayloadAsUint8Array,
  setMetaValue,
  type BlobDtype,
  type BlobKey,
  type BlobRecord,
  type ProjectRecord,
  type StoredBinaryPayload,
  type ShadowPaintDb,
} from '@/persistence/db';
import { clearActiveFileHandle } from '@/persistence/fileAccess';
import { migrateProjectSettings } from '@/persistence/migrations';
import { packReliefProject } from '@/persistence/projectArchive';
import { encodeThumbnailPngSync } from '@/persistence/thumbnail';
import { useEditorStore } from '@/state/editorStore';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';
import { getIoWorker } from '@/workers/client';
import { runTask } from '@/workers/tasks';

const REQUIRED_BLOB_KEYS: readonly BlobKey[] = [
  'color.base',
  'color.working',
  'height.base',
  'height.working',
  'opacity.base',
  'opacity.working',
];

export const AUTOSAVE_DEBOUNCE_MS = 2000;
export const AUTOSAVE_MAX_WAIT_MS = 15000;

export interface AutosaveControllerOptions {
  database?: ShadowPaintDb;
  registry?: MapRegistry;
  debounceMs?: number;
  maxWaitMs?: number;
  onQuotaExceeded?: () => void;
  requestStoragePersist?: () => Promise<boolean>;
}

export interface AutosaveControllerStats {
  lastSavedKeys: BlobKey[];
  saveCount: number;
}

function dtypeForBlobKey(key: BlobKey): BlobDtype {
  if (key.startsWith('color.')) return 'rgba8';
  if (key === 'selection') return 'uint8';
  return 'float32';
}

function snapshotBlobRawBytes(key: BlobKey, registry: MapRegistry): Uint8Array {
  switch (key) {
    case 'color.base':
      return new Uint8Array(asUint8Array(registry.color.base));
    case 'color.working':
      return new Uint8Array(asUint8Array(registry.color.working));
    case 'height.base':
      return float32ToLittleEndianBytes(registry.heightMap.base);
    case 'height.working':
      return float32ToLittleEndianBytes(registry.heightMap.working);
    case 'opacity.base':
      return float32ToLittleEndianBytes(registry.opacity.base);
    case 'opacity.working':
      return float32ToLittleEndianBytes(registry.opacity.working);
    case 'selection':
      return new Uint8Array(registry.selection);
  }
}

export class AutosaveController {
  private readonly database: ShadowPaintDb;
  private readonly registry: MapRegistry;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private onQuotaExceeded?: () => void;
  private readonly requestStoragePersist?: () => Promise<boolean>;

  private started = false;
  private suppressDepth = 0;
  private persistedStorageRequested = false;

  private lastSavedProjectId: string | null = null;
  private lastSavedTimestamp: string | null = null;
  private dirtyBlobs = new Set<BlobKey>();
  private settingsDirty = false;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlightPromise: Promise<boolean> | null = null;

  private unsubDirty: (() => void) | null = null;
  private unsubReplaced: (() => void) | null = null;
  private unsubSelection: (() => void) | null = null;
  private unsubProjectStore: (() => void) | null = null;

  readonly stats: AutosaveControllerStats = {
    lastSavedKeys: [],
    saveCount: 0,
  };

  constructor(options: AutosaveControllerOptions = {}) {
    this.database = options.database ?? db;
    this.registry = options.registry ?? mapRegistry;
    this.debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;
    this.onQuotaExceeded = options.onQuotaExceeded;
    this.requestStoragePersist = options.requestStoragePersist;
  }

  setOnQuotaExceeded(handler: (() => void) | undefined): void {
    this.onQuotaExceeded = handler;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubDirty = this.registry.events.on('dirty', ({ mapId }) => {
      if (this.suppressDepth > 0) return;
      this.markBlobsDirty([`${mapId}.working` as BlobKey]);
    });

    this.unsubReplaced = this.registry.events.on('replaced', ({ mapId, scope }) => {
      if (this.suppressDepth > 0) return;
      if (scope === 'effective') return;
      if (mapId === 'all') {
        this.markAllDirty();
        return;
      }
      if (scope === 'working') {
        this.markBlobsDirty([`${mapId}.working` as BlobKey]);
        return;
      }
      this.markBlobsDirty([`${mapId}.base` as BlobKey, `${mapId}.working` as BlobKey]);
    });

    this.unsubSelection = this.registry.events.on('selectionChanged', () => {
      if (this.suppressDepth > 0) return;
      this.markBlobsDirty(['selection']);
    });

    let prevProjectRef = useProjectStore.getState().project;
    this.unsubProjectStore = useProjectStore.subscribe((state) => {
      if (state.project === prevProjectRef) return;
      const prevId = prevProjectRef.id;
      prevProjectRef = state.project;
      if (this.suppressDepth > 0) return;
      if (state.project.id !== prevId) {
        this.markAllDirty();
      } else {
        this.markSettingsDirty();
      }
    });
  }

  stop(): void {
    this.clearTimers();
    this.unsubDirty?.();
    this.unsubReplaced?.();
    this.unsubSelection?.();
    this.unsubProjectStore?.();
    this.unsubDirty = null;
    this.unsubReplaced = null;
    this.unsubSelection = null;
    this.unsubProjectStore = null;
    this.started = false;
  }

  runSuppressed<T>(fn: () => T): T {
    this.suppressDepth++;
    try {
      return fn();
    } finally {
      this.suppressDepth--;
    }
  }

  async runSuppressedAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.suppressDepth++;
    try {
      return await fn();
    } finally {
      this.suppressDepth--;
    }
  }

  syncSavedProject(projectId: string, savedAt: string): void {
    this.clearTimers();
    this.lastSavedProjectId = projectId;
    this.lastSavedTimestamp = savedAt;
    this.dirtyBlobs.clear();
    this.settingsDirty = false;
  }

  resetTracking(): void {
    this.clearTimers();
    this.lastSavedProjectId = null;
    this.lastSavedTimestamp = null;
    this.dirtyBlobs.clear();
    this.settingsDirty = false;
  }

  hasPendingChanges(): boolean {
    return this.settingsDirty || this.dirtyBlobs.size > 0;
  }

  markBlobsDirty(keys: readonly BlobKey[]): void {
    for (const key of keys) {
      this.dirtyBlobs.add(key);
    }
    this.settingsDirty = true;
    this.onDirtied();
  }

  markSettingsDirty(): void {
    this.settingsDirty = true;
    this.onDirtied();
  }

  markAllDirty(): void {
    for (const key of ALL_BLOB_KEYS) {
      this.dirtyBlobs.add(key);
    }
    this.settingsDirty = true;
    this.onDirtied();
  }

  private onDirtied(): void {
    if (!this.registry.isAllocated) return;
    useUiStore.getState().setAutosaveStatus('unsaved', this.lastSavedTimestamp);
    if (!this.started) return;
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushNow();
    }, this.debounceMs);

    if (this.maxWaitTimer === null) {
      this.maxWaitTimer = setTimeout(() => {
        this.maxWaitTimer = null;
        void this.flushNow();
      }, this.maxWaitMs);
    }
  }

  private clearTimers(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer !== null) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  async flushNow(): Promise<boolean> {
    this.clearTimers();
    if (this.inFlightPromise) {
      return await this.inFlightPromise;
    }

    const promise = this.performSave();
    this.inFlightPromise = promise;
    try {
      return await promise;
    } finally {
      this.inFlightPromise = null;
      if (this.started && this.hasPendingChanges()) {
        this.scheduleSave();
      }
    }
  }

  private async performSave(): Promise<boolean> {
    if (!this.registry.isAllocated) return false;
    const project = structuredClone(useProjectStore.getState().project);

    const projectChanged = this.lastSavedProjectId !== project.id;
    if (projectChanged) {
      for (const key of ALL_BLOB_KEYS) {
        this.dirtyBlobs.add(key);
      }
      this.settingsDirty = true;
    }

    if (!this.settingsDirty && this.dirtyBlobs.size === 0) {
      return true;
    }

    const keysToSave = Array.from(this.dirtyBlobs);
    this.dirtyBlobs.clear();
    this.settingsDirty = false;

    const ui = useUiStore.getState();
    ui.setAutosaveStatus('saving', this.lastSavedTimestamp);

    const now = new Date().toISOString();
    const width = this.registry.width;
    const height = this.registry.height;

    try {
      const compressedRecords: BlobRecord[] = await Promise.all(
        keysToSave.map(async (key) => {
          const rawBytes = snapshotBlobRawBytes(key, this.registry);
          const compressed = await compressBytes(rawBytes, 1);
          return {
            projectId: project.id,
            key,
            dtype: dtypeForBlobKey(key),
            width,
            height,
            data: bytesToStoredPayload(compressed, 'application/octet-stream'),
            updatedAt: now,
          };
        }),
      );

      let existingProject = await this.database.projects.get(project.id);
      const shouldUpdateThumb =
        !existingProject ||
        keysToSave.includes('color.working') ||
        keysToSave.includes('color.base');

      let thumbnailBlob: StoredBinaryPayload;
      if (shouldUpdateThumb) {
        if (this.registry.dirtyTiles.hasDirty('color')) {
          flushEffectiveMap(this.registry, 'color', project.adjustments);
        }
        const colorEffCopy = new Uint8Array(asUint8Array(this.registry.color.effective));
        let thumbBytes: Uint8Array;
        if (typeof Worker !== 'undefined') {
          const worker = getIoWorker();
          thumbBytes = await worker.encodeThumbnailPng(
            transfer(colorEffCopy, [colorEffCopy.buffer]),
            width,
            height,
            512,
          );
        } else {
          thumbBytes = encodeThumbnailPngSync(colorEffCopy, width, height, 512);
        }
        thumbnailBlob = bytesToStoredPayload(thumbBytes, 'image/png');
      } else {
        thumbnailBlob = existingProject?.thumbnail ?? bytesToStoredPayload(new Uint8Array(0), 'image/png');
      }

      const existingBlobs = await this.database.blobs
        .where('projectId')
        .equals(project.id)
        .toArray();
      const sizeMap = new Map<BlobKey, number>();
      for (const b of existingBlobs) {
        sizeMap.set(b.key, getStoredPayloadSize(b.data));
      }
      for (const b of compressedRecords) {
        sizeMap.set(b.key, getStoredPayloadSize(b.data));
      }
      let totalSizeBytes = getStoredPayloadSize(thumbnailBlob);
      for (const size of sizeMap.values()) {
        totalSizeBytes += size;
      }

      const projectRecord: ProjectRecord = {
        id: project.id,
        name: project.name,
        updatedAt: now,
        settings: project,
        thumbnail: thumbnailBlob,
        sizeBytes: totalSizeBytes,
      };

      await this.database.transaction(
        'rw',
        this.database.projects,
        this.database.blobs,
        this.database.meta,
        async () => {
          if (compressedRecords.length > 0) {
            await this.database.blobs.bulkPut(compressedRecords);
          }
          await this.database.projects.put(projectRecord);
          await this.database.meta.put({ key: 'lastProjectId', value: project.id });
        },
      );

      existingProject = projectRecord;
      this.lastSavedProjectId = project.id;
      this.lastSavedTimestamp = now;
      this.stats.lastSavedKeys = keysToSave;
      this.stats.saveCount += 1;

      useUiStore.getState().setAutosaveStatus('saved', now);

      if (!this.persistedStorageRequested) {
        this.persistedStorageRequested = true;
        try {
          if (this.requestStoragePersist) {
            void Promise.resolve(this.requestStoragePersist()).catch(() => {});
          } else if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
            void navigator.storage.persist().catch(() => {});
          }
        } catch {
          // Ignore persist permission failures
        }
      }

      return true;
    } catch (err) {
      for (const key of keysToSave) {
        this.dirtyBlobs.add(key);
      }
      this.settingsDirty = true;

      useUiStore.getState().setAutosaveStatus('error', this.lastSavedTimestamp);
      if (isQuotaExceededError(err)) {
        this.onQuotaExceeded?.();
      }
      return false;
    }
  }
}

export const autosaveController = new AutosaveController();

export function runWithoutAutosaveTracking<T>(fn: () => T): T {
  return autosaveController.runSuppressed(fn);
}

export async function flushAutosave(): Promise<boolean> {
  return await autosaveController.flushNow();
}

export interface DecodedDbProjectPayload {
  settings: ProjectSettings;
  updatedAt: string;
  colorBase: Uint8ClampedArray;
  colorWorking: Uint8ClampedArray;
  colorEffective: Uint8ClampedArray;
  heightBase: Float32Array;
  heightWorking: Float32Array;
  heightEffective: Float32Array;
  opacityBase: Float32Array;
  opacityWorking: Float32Array;
  opacityEffective: Float32Array;
  selection: Uint8Array;
}

export async function loadDecodedProjectFromDb(
  projectId: string,
  database: ShadowPaintDb = db,
): Promise<DecodedDbProjectPayload | null> {
  const projectRecord = await database.projects.get(projectId);
  if (!projectRecord) return null;

  const blobRecords = await database.blobs.where('projectId').equals(projectId).toArray();
  const byKey = new Map<BlobKey, BlobRecord>();
  for (const record of blobRecords) {
    byKey.set(record.key, record);
  }

  for (const requiredKey of REQUIRED_BLOB_KEYS) {
    if (!byKey.has(requiredKey)) {
      return null;
    }
  }

  const settings = migrateProjectSettings(projectRecord.settings);
  const { widthPx, heightPx } = settings.canvas;
  const pixelCount = widthPx * heightPx;

  const inflateKey = async (key: BlobKey): Promise<Uint8Array | null> => {
    const rec = byKey.get(key);
    if (!rec) return null;
    const compressed = await readStoredPayloadAsUint8Array(rec.data);
    return await decompressBytes(compressed);
  };

  const [
    colorBaseBytes,
    colorWorkingBytes,
    heightBaseBytes,
    heightWorkingBytes,
    opacityBaseBytes,
    opacityWorkingBytes,
    selectionBytes,
  ] = await Promise.all([
    inflateKey('color.base'),
    inflateKey('color.working'),
    inflateKey('height.base'),
    inflateKey('height.working'),
    inflateKey('opacity.base'),
    inflateKey('opacity.working'),
    inflateKey('selection'),
  ]);

  if (
    !colorBaseBytes ||
    !colorWorkingBytes ||
    !heightBaseBytes ||
    !heightWorkingBytes ||
    !opacityBaseBytes ||
    !opacityWorkingBytes
  ) {
    return null;
  }

  const colorBase = uint8ToClampedRgba(colorBaseBytes);
  const colorWorking = uint8ToClampedRgba(colorWorkingBytes);
  const heightBase = littleEndianBytesToFloat32(heightBaseBytes);
  const heightWorking = littleEndianBytesToFloat32(heightWorkingBytes);
  const opacityBase = littleEndianBytesToFloat32(opacityBaseBytes);
  const opacityWorking = littleEndianBytesToFloat32(opacityWorkingBytes);
  const selection =
    selectionBytes && selectionBytes.length === pixelCount
      ? selectionBytes
      : new Uint8Array(pixelCount);

  if (
    colorBase.length !== pixelCount * 4 ||
    colorWorking.length !== pixelCount * 4 ||
    heightBase.length !== pixelCount ||
    heightWorking.length !== pixelCount ||
    opacityBase.length !== pixelCount ||
    opacityWorking.length !== pixelCount
  ) {
    return null;
  }

  const colorEffective = new Uint8ClampedArray(pixelCount * 4);
  const heightEffective = new Float32Array(pixelCount);
  const opacityEffective = new Float32Array(pixelCount);

  applyColorAdjustments(colorWorking, colorEffective, widthPx, heightPx, settings.adjustments.color);
  applyHeightAdjustments(
    heightWorking,
    heightEffective,
    widthPx,
    heightPx,
    settings.adjustments.height,
  );
  applyOpacityAdjustments(
    opacityWorking,
    opacityEffective,
    widthPx,
    heightPx,
    settings.adjustments.opacity,
  );

  return {
    settings,
    updatedAt: projectRecord.updatedAt,
    colorBase,
    colorWorking,
    colorEffective,
    heightBase,
    heightWorking,
    heightEffective,
    opacityBase,
    opacityWorking,
    opacityEffective,
    selection,
  };
}

export async function restoreProjectFromIndexedDb(
  projectId: string,
  options: { database?: ShadowPaintDb; controller?: AutosaveController; registry?: MapRegistry } = {},
): Promise<ProjectSettings | null> {
  const database = options.database ?? db;
  const controller = options.controller ?? autosaveController;
  const registry = options.registry ?? mapRegistry;

  const decoded = await loadDecodedProjectFromDb(projectId, database);
  if (!decoded) return null;

  controller.runSuppressed(() => {
    registry.replaceAll({
      width: decoded.settings.canvas.widthPx,
      height: decoded.settings.canvas.heightPx,
      colorBase: decoded.colorBase,
      colorWorking: decoded.colorWorking,
      colorEffective: decoded.colorEffective,
      heightBase: decoded.heightBase,
      heightWorking: decoded.heightWorking,
      heightEffective: decoded.heightEffective,
      opacityBase: decoded.opacityBase,
      opacityWorking: decoded.opacityWorking,
      opacityEffective: decoded.opacityEffective,
      selection: decoded.selection,
    });
    clearActiveFileHandle();
    useHistoryStore.getState().clearAll();
    useProjectStore.getState().setProject(decoded.settings, false);
    const editor = useEditorStore.getState();
    editor.setHasSelection(registry.hasSelection);
    editor.setRulerLine(null);
    editor.setCrossSectionLine(null);
  });

  await setMetaValue('lastProjectId', decoded.settings.id, database);
  controller.syncSavedProject(decoded.settings.id, decoded.updatedAt);
  useUiStore.getState().setAutosaveStatus('saved', decoded.updatedAt);
  return decoded.settings;
}

export async function checkRestorableSession(
  database: ShadowPaintDb = db,
): Promise<ProjectRecord | null> {
  const rec = await database.meta.get('lastProjectId');
  const lastId = typeof rec?.value === 'string' ? rec.value : null;
  if (!lastId) return null;
  const project = await database.projects.get(lastId);
  if (!project) return null;
  const blobCount = await database.blobs.where('projectId').equals(lastId).count();
  if (blobCount < REQUIRED_BLOB_KEYS.length) return null;
  return project;
}

export async function discardRestorableSession(database: ShadowPaintDb = db): Promise<void> {
  await deleteMetaValue('lastProjectId', database);
  useUiStore.getState().setAutosaveStatus('idle', null);
}

export async function buildReliefArchiveBytesForProject(
  projectId: string,
  database: ShadowPaintDb = db,
  onProgress?: (progress01: number) => void,
): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const decoded = await loadDecodedProjectFromDb(projectId, database);
  if (!decoded) return null;

  const { settings } = decoded;
  const filename = `${sanitizeExportSlug(settings.name)}.relief`;
  const colorBase = new Uint8Array(asUint8Array(decoded.colorBase));
  const colorWorking = new Uint8Array(asUint8Array(decoded.colorWorking));
  const colorEffective = new Uint8Array(asUint8Array(decoded.colorEffective));
  const heightBase = new Float32Array(decoded.heightBase);
  const heightWorking = new Float32Array(decoded.heightWorking);
  const heightEffective = new Float32Array(decoded.heightEffective);
  const opacityBase = new Float32Array(decoded.opacityBase);
  const opacityWorking = new Float32Array(decoded.opacityWorking);
  const opacityEffective = new Float32Array(decoded.opacityEffective);
  const selection = new Uint8Array(decoded.selection);

  let bytes: Uint8Array;
  if (typeof Worker !== 'undefined') {
    const worker = getIoWorker();
    bytes = await worker.packReliefProject(
      transfer(
        {
          project: settings,
          colorBase,
          colorWorking,
          colorEffective,
          heightBase,
          heightWorking,
          heightEffective,
          opacityBase,
          opacityWorking,
          opacityEffective,
          selection,
        },
        [
          colorBase.buffer,
          colorWorking.buffer,
          colorEffective.buffer,
          heightBase.buffer,
          heightWorking.buffer,
          heightEffective.buffer,
          opacityBase.buffer,
          opacityWorking.buffer,
          opacityEffective.buffer,
          selection.buffer,
        ],
      ),
      onProgress ? proxy(onProgress) : undefined,
    );
  } else {
    bytes = packReliefProject({
      project: settings,
      colorBase,
      colorWorking,
      colorEffective,
      heightBase,
      heightWorking,
      heightEffective,
      opacityBase,
      opacityWorking,
      opacityEffective,
      selection,
      onProgress,
    });
  }

  return { filename, bytes };
}

export async function downloadProjectReliefFromDb(
  projectId: string,
  database: ShadowPaintDb = db,
): Promise<boolean> {
  const result = await runTask(
    { labelKey: 'autosave.taskPackingRelief', cancellable: false },
    async (ctx) =>
      buildReliefArchiveBytesForProject(projectId, database, (p) => ctx.setProgress(p)),
  );
  if (!result) return false;
  triggerDownload(result.bytes, 'application/zip', result.filename);
  return true;
}

export function isMapId(value: string): value is MapId {
  return value === 'color' || value === 'height' || value === 'opacity';
}
