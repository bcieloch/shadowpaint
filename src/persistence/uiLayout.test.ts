import { indexedDB as fakeIndexedDB, IDBKeyRange as FakeIDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCustomShortcuts,
  getUiLayout,
  saveCustomShortcuts,
  saveUiLayout,
  ShadowPaintDb,
} from '@/persistence/db';

let testDbCounter = 0;

describe('persistence/db meta.uiLayout & meta.customShortcuts', () => {
  let testDb: ShadowPaintDb;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).indexedDB = fakeIndexedDB;
    (globalThis as Record<string, unknown>).IDBKeyRange = FakeIDBKeyRange;
    testDbCounter += 1;
    testDb = new ShadowPaintDb(`shadowpaint-uilayout-test-${testDbCounter}`);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('persists, merges, and sanitizes meta.uiLayout entries in IndexedDB', async () => {
    expect(await getUiLayout(testDb)).toEqual({});

    await saveUiLayout(
      {
        leftPanelSize: 312,
        rightPanelSize: 384,
        panelsHidden: true,
        splitRatio: 0.64,
        rightTab: 'light',
      },
      testDb,
    );

    const loaded = await getUiLayout(testDb);
    expect(loaded).toEqual({
      leftPanelSize: 312,
      rightPanelSize: 384,
      panelsHidden: true,
      splitRatio: 0.64,
      rightTab: 'light',
    });

    // Partial update merges with existing preferences and clamps out-of-range values
    await saveUiLayout(
      {
        leftPanelSize: 999,
        splitRatio: 0.05,
        panelsHidden: false,
      },
      testDb,
    );

    const updated = await getUiLayout(testDb);
    expect(updated).toEqual({
      leftPanelSize: 380,
      rightPanelSize: 384,
      panelsHidden: false,
      splitRatio: 0.2,
      rightTab: 'light',
    });
  });

  it('persists and sanitizes meta.customShortcuts in IndexedDB', async () => {
    expect(await getCustomShortcuts(testDb)).toEqual({});

    await saveCustomShortcuts(
      {
        toolBrush: ['K'],
        fileImport: ['Ctrl', 'Alt', 'I'],
        toolEraser: ['E'], // matches default -> stripped
      },
      testDb,
    );

    const loaded = await getCustomShortcuts(testDb);
    expect(loaded).toEqual({
      toolBrush: ['K'],
      fileImport: ['Ctrl', 'Alt', 'I'],
    });
  });
});
