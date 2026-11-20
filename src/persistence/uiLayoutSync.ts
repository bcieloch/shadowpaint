import { isRightTabId, type UiLayoutPreference } from '@/core/layout';
import { getUiLayout, saveUiLayout, type ShadowPaintDb } from '@/persistence/db';
import { useEditorStore } from '@/state/editorStore';
import { useUiStore } from '@/state/uiStore';

const SAVE_DEBOUNCE_MS = 100;

export function startUiLayoutSync(database?: ShadowPaintDb): () => void {
  let stopped = false;
  let applyingHydration = false;
  let saveTimer: number | null = null;
  let pendingPatch: UiLayoutPreference | null = null;

  const flushPendingSave = () => {
    if (saveTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    const patch = pendingPatch;
    pendingPatch = null;
    if (!patch) return;
    void saveUiLayout(patch, database);
  };

  const scheduleSave = (patch: UiLayoutPreference) => {
    if (applyingHydration || stopped) return;
    pendingPatch = { ...(pendingPatch ?? {}), ...patch };
    if (typeof window === 'undefined') {
      flushPendingSave();
      return;
    }
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      flushPendingSave();
    }, SAVE_DEBOUNCE_MS);
  };

  void getUiLayout(database).then((pref) => {
    if (stopped) return;
    applyingHydration = true;
    try {
      useEditorStore.getState().hydrateUiLayout(pref);
      if (isRightTabId(pref.rightTab)) {
        useUiStore.getState().setRightTab(pref.rightTab);
      }
    } finally {
      applyingHydration = false;
    }
  });

  const unsubEditor = useEditorStore.subscribe((state, prev) => {
    if (
      state.leftPanelSize !== prev.leftPanelSize ||
      state.rightPanelSize !== prev.rightPanelSize ||
      state.panelsHidden !== prev.panelsHidden ||
      state.splitRatio !== prev.splitRatio
    ) {
      scheduleSave({
        leftPanelSize: state.leftPanelSize,
        rightPanelSize: state.rightPanelSize,
        panelsHidden: state.panelsHidden,
        splitRatio: state.splitRatio,
      });
    }
  });

  const unsubUi = useUiStore.subscribe((state, prev) => {
    if (state.rightTab !== prev.rightTab) {
      scheduleSave({ rightTab: state.rightTab });
    }
  });

  return () => {
    stopped = true;
    unsubEditor();
    unsubUi();
    flushPendingSave();
  };
}
