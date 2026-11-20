import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '@/core/constants';
import { applyHeightAdjustments } from '@/core/maps/adjustments';
import { MapRegistry } from '@/core/maps/MapRegistry';
import {
  AutosaveController,
  buildReliefArchiveBytesForProject,
  checkRestorableSession,
  discardRestorableSession,
  restoreProjectFromIndexedDb,
} from '@/persistence/autosave';
import { deleteProjectFromDb, listRecentProjects, ShadowPaintDb } from '@/persistence/db';
import { useProjectStore } from '@/state/projectStore';
import { useUiStore } from '@/state/uiStore';

describe('IndexedDB autosave persistence', () => {
  let dbName: string;
  let testDb: ShadowPaintDb;
  let registry: MapRegistry;
  let controller: AutosaveController;

  beforeEach(async () => {
    dbName = `shadowpaint-test-${Math.random().toString(36).slice(2)}`;
    testDb = new ShadowPaintDb(dbName);
    await testDb.open();
    registry = new MapRegistry();
    useUiStore.getState().setAutosaveStatus('idle', null);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(async () => {
    controller?.stop();
    await testDb.delete();
  });

  it('round-trips base, working, effective, selection, and settings byte-for-byte without touching localStorage', async () => {
    const project = createDefaultProject({
      id: 'proj-roundtrip',
      name: 'Impasto Relief',
      canvas: {
        widthCm: 20,
        heightCm: 20,
        widthPx: 8,
        heightPx: 8,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    project.adjustments.height = { invert: false, contrast: 0.25, gamma: 1.2 };
    project.material.preset = 'oilImpasto';
    project.material.scatterRadiusMm = 2.5;
    project.lighting.mode = 'combined';

    registry.allocate(8, 8);
    useProjectStore.getState().setProject(project, false);

    // Paint distinct values into base, working, and selection
    registry.color.base[0] = 12;
    registry.color.base[1] = 34;
    registry.color.base[2] = 56;
    registry.color.working[0] = 200;
    registry.color.working[1] = 150;
    registry.color.working[2] = 100;
    registry.color.effective.set(registry.color.working);

    registry.heightMap.base[5] = 0.25;
    registry.heightMap.working[5] = 0.75;
    applyHeightAdjustments(
      registry.heightMap.working,
      registry.heightMap.effective,
      8,
      8,
      project.adjustments.height,
    );

    registry.opacity.base[9] = 0.4;
    registry.opacity.working[9] = 0.85;
    registry.opacity.effective.set(registry.opacity.working);

    registry.selection[10] = 255;
    registry.refreshSelectionState();

    const expectedColorBase = new Uint8ClampedArray(registry.color.base);
    const expectedColorWorking = new Uint8ClampedArray(registry.color.working);
    const expectedHeightBase = new Float32Array(registry.heightMap.base);
    const expectedHeightWorking = new Float32Array(registry.heightMap.working);
    const expectedHeightEffective = new Float32Array(registry.heightMap.effective);
    const expectedOpacityBase = new Float32Array(registry.opacity.base);
    const expectedOpacityWorking = new Float32Array(registry.opacity.working);
    const expectedSelection = new Uint8Array(registry.selection);

    const persistMock = vi.fn(() => Promise.resolve(true));
    controller = new AutosaveController({
      database: testDb,
      registry,
      debounceMs: 20,
      maxWaitMs: 100,
      requestStoragePersist: persistMock,
    });
    controller.start();
    controller.markAllDirty();
    const ok = await controller.flushNow();
    expect(ok).toBe(true);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().autosaveStatus).toBe('saved');

    // Verify localStorage has zero map keys
    if (typeof window !== 'undefined' && window.localStorage) {
      expect(window.localStorage.length).toBe(0);
    }

    // Check restorable session detects our saved project
    const candidate = await checkRestorableSession(testDb);
    expect(candidate?.id).toBe('proj-roundtrip');
    expect(candidate?.name).toBe('Impasto Relief');

    // Wipe in-memory registry with an unrelated blank project
    const other = createDefaultProject({
      id: 'proj-blank',
      name: 'Blank',
      canvas: {
        widthCm: 10,
        heightCm: 10,
        widthPx: 4,
        heightPx: 4,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    controller.runSuppressed(() => {
      registry.allocate(4, 4);
      useProjectStore.getState().setProject(other, false);
    });

    // Restore from IndexedDB
    const restored = await restoreProjectFromIndexedDb('proj-roundtrip', {
      database: testDb,
      controller,
      registry,
    });
    expect(restored).not.toBeNull();
    expect(restored?.name).toBe('Impasto Relief');
    expect(restored?.material.scatterRadiusMm).toBe(2.5);
    expect(restored?.lighting.mode).toBe('combined');

    expect(registry.width).toBe(8);
    expect(registry.height).toBe(8);
    expect(Array.from(registry.color.base)).toEqual(Array.from(expectedColorBase));
    expect(Array.from(registry.color.working)).toEqual(Array.from(expectedColorWorking));
    expect(Array.from(registry.heightMap.base)).toEqual(Array.from(expectedHeightBase));
    expect(Array.from(registry.heightMap.working)).toEqual(Array.from(expectedHeightWorking));
    expect(Array.from(registry.heightMap.effective)).toEqual(Array.from(expectedHeightEffective));
    expect(Array.from(registry.opacity.base)).toEqual(Array.from(expectedOpacityBase));
    expect(Array.from(registry.opacity.working)).toEqual(Array.from(expectedOpacityWorking));
    expect(Array.from(registry.selection)).toEqual(Array.from(expectedSelection));
    expect(registry.hasSelection).toBe(true);
    expect(useUiStore.getState().autosaveStatus).toBe('saved');
  });

  it('compresses and writes only dirty blobs on incremental map edits', async () => {
    const project = createDefaultProject({
      id: 'proj-dirty',
      name: 'Dirty Check',
      canvas: {
        widthCm: 10,
        heightCm: 10,
        widthPx: 8,
        heightPx: 8,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    registry.allocate(8, 8);
    useProjectStore.getState().setProject(project, false);

    controller = new AutosaveController({
      database: testDb,
      registry,
      debounceMs: 10,
      maxWaitMs: 50,
    });
    controller.start();
    controller.markAllDirty();
    await controller.flushNow();
    expect(controller.stats.lastSavedKeys.length).toBe(7);

    // Dirty only height.working via MapRegistry dirty event
    registry.heightMap.working[12] = 0.6;
    registry.emitDirty('height', { x: 4, y: 1, w: 1, h: 1 });
    await controller.flushNow();

    expect(controller.stats.lastSavedKeys).toEqual(['height.working']);

    // Build .relief archive directly from stored DB blobs
    const relief = await buildReliefArchiveBytesForProject('proj-dirty', testDb);
    expect(relief).not.toBeNull();
    expect(relief?.filename).toBe('dirty-check.relief');
    expect(relief?.bytes.byteLength).toBeGreaterThan(100);
  });

  it('deletes project blobs and clears lastProjectId meta', async () => {
    const project = createDefaultProject({
      id: 'proj-del',
      name: 'To Delete',
      canvas: {
        widthCm: 10,
        heightCm: 10,
        widthPx: 8,
        heightPx: 8,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    registry.allocate(8, 8);
    useProjectStore.getState().setProject(project, false);

    controller = new AutosaveController({ database: testDb, registry });
    controller.start();
    controller.markAllDirty();
    await controller.flushNow();

    expect(await listRecentProjects(testDb)).toHaveLength(1);
    expect(await testDb.blobs.where('projectId').equals('proj-del').count()).toBe(7);

    await deleteProjectFromDb('proj-del', testDb);
    expect(await listRecentProjects(testDb)).toHaveLength(0);
    expect(await testDb.blobs.where('projectId').equals('proj-del').count()).toBe(0);
    expect(await checkRestorableSession(testDb)).toBeNull();
  });

  it('handles QuotaExceededError cleanly without losing dirty tracking', async () => {
    const project = createDefaultProject({
      id: 'proj-quota',
      name: 'Quota Test',
      canvas: {
        widthCm: 10,
        heightCm: 10,
        widthPx: 8,
        heightPx: 8,
        minThicknessMm: 0,
        maxThicknessMm: 5,
      },
    });
    registry.allocate(8, 8);
    useProjectStore.getState().setProject(project, false);

    const quotaHandler = vi.fn();
    controller = new AutosaveController({
      database: testDb,
      registry,
      onQuotaExceeded: quotaHandler,
    });

    const quotaErr = Object.assign(new Error('Storage quota exceeded'), {
      name: 'QuotaExceededError',
    });
    const txSpy = vi.spyOn(testDb, 'transaction').mockRejectedValueOnce(quotaErr);

    controller.markAllDirty();
    const ok = await controller.flushNow();
    txSpy.mockRestore();

    expect(ok).toBe(false);
    expect(quotaHandler).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().autosaveStatus).toBe('error');
    expect(controller.hasPendingChanges()).toBe(true);

    // Discarding restorable session resets status
    await discardRestorableSession(testDb);
    expect(useUiStore.getState().autosaveStatus).toBe('idle');
  });
});
