import { create } from 'zustand';
import type { RightTabId } from '@/core/layout';
import type { TranslationKey, TranslationParams } from '@/i18n';
import type { ReliefFileHandle } from '@/persistence/fileAccess';

export type { RightTabId };

export interface BackgroundTask {
  id: string;
  labelKey: TranslationKey;
  labelParams?: TranslationParams;
  progress: number;
  cancellable: boolean;
  cancel?: () => void;
}

export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export interface PendingOpenRelief {
  file: File;
  handle: ReliefFileHandle | null;
}

export interface UiDialogsState {
  newProjectOpen: boolean;
  importWizardOpen: boolean;
  exportOpen: boolean;
  recentProjectsOpen: boolean;
  shortcutsOpen: boolean;
  guideOpen: boolean;
}

export function hasOpenModalDialog(state: Pick<UiState, 'dialogs' | 'pendingOpenRelief'>): boolean {
  return (
    state.pendingOpenRelief !== null ||
    state.dialogs.newProjectOpen ||
    state.dialogs.importWizardOpen ||
    state.dialogs.exportOpen ||
    state.dialogs.recentProjectsOpen ||
    state.dialogs.shortcutsOpen ||
    state.dialogs.guideOpen
  );
}

export interface UiState {
  dialogs: UiDialogsState;
  pendingOpenRelief: PendingOpenRelief | null;
  rightTab: RightTabId;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  tasks: BackgroundTask[];
  autosaveStatus: AutosaveStatus;
  autosaveTimestamp: string | null;
  statusMessage: { key: TranslationKey; params?: TranslationParams } | null;
  setDialogOpen: (dialog: keyof UiDialogsState, open: boolean) => void;
  setPendingOpenRelief: (pending: PendingOpenRelief | null) => void;
  setRightTab: (tab: RightTabId) => void;
  setLeftDrawerOpen: (open: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
  upsertTask: (task: BackgroundTask) => void;
  removeTask: (id: string) => void;
  setAutosaveStatus: (status: AutosaveStatus, timestamp?: string | null) => void;
  setStatusMessage: (msg: { key: TranslationKey; params?: TranslationParams } | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  dialogs: {
    newProjectOpen: false,
    importWizardOpen: false,
    exportOpen: false,
    recentProjectsOpen: false,
    shortcutsOpen: false,
    guideOpen: false,
  },
  pendingOpenRelief: null,
  rightTab: 'map',
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  tasks: [],
  autosaveStatus: 'idle',
  autosaveTimestamp: null,
  statusMessage: null,
  setDialogOpen: (dialog, open) =>
    set((s) => ({ dialogs: { ...s.dialogs, [dialog]: open } })),
  setPendingOpenRelief: (pendingOpenRelief) => set({ pendingOpenRelief }),
  setRightTab: (rightTab) => set({ rightTab }),
  setLeftDrawerOpen: (leftDrawerOpen) => set({ leftDrawerOpen }),
  setRightDrawerOpen: (rightDrawerOpen) => set({ rightDrawerOpen }),
  upsertTask: (task) =>
    set((s) => {
      const idx = s.tasks.findIndex((t) => t.id === task.id);
      if (idx === -1) {
        return { tasks: [...s.tasks, task] };
      }
      const next = [...s.tasks];
      next[idx] = task;
      return { tasks: next };
    }),
  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  setAutosaveStatus: (autosaveStatus, timestamp = null) =>
    set({ autosaveStatus, autosaveTimestamp: timestamp }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
}));
