import { create } from 'zustand';
import type { TranslationKey, TranslationParams } from '@/i18n';

export interface BackgroundTask {
  id: string;
  labelKey: TranslationKey;
  labelParams?: TranslationParams;
  progress: number;
  cancellable: boolean;
  cancel?: () => void;
}

export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export interface UiDialogsState {
  newProjectOpen: boolean;
  importWizardOpen: boolean;
  exportOpen: boolean;
}

export interface UiState {
  dialogs: UiDialogsState;
  tasks: BackgroundTask[];
  autosaveStatus: AutosaveStatus;
  autosaveTimestamp: string | null;
  statusMessage: { key: TranslationKey; params?: TranslationParams } | null;
  setDialogOpen: (dialog: keyof UiDialogsState, open: boolean) => void;
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
  },
  tasks: [],
  autosaveStatus: 'idle',
  autosaveTimestamp: null,
  statusMessage: null,
  setDialogOpen: (dialog, open) =>
    set((s) => ({ dialogs: { ...s.dialogs, [dialog]: open } })),
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
