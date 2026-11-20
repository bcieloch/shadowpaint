import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createDefaultProject } from '@/core/constants';
import type { ProjectSettings } from '@/core/types';

export interface ProjectState {
  project: ProjectSettings;
  isDirty: boolean;
  setProject: (project: ProjectSettings, markDirty?: boolean) => void;
  updateProject: (recipe: (draft: ProjectSettings) => void, markDirty?: boolean) => void;
  setClean: () => void;
}

export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    project: createDefaultProject(),
    isDirty: false,
    setProject: (project, markDirty = false) =>
      set((state) => {
        state.project = project;
        state.isDirty = markDirty;
      }),
    updateProject: (recipe, markDirty = true) =>
      set((state) => {
        recipe(state.project);
        state.project.updatedAt = new Date().toISOString();
        if (markDirty) {
          state.isDirty = true;
        }
      }),
    setClean: () =>
      set((state) => {
        state.isDirty = false;
      }),
  })),
);
