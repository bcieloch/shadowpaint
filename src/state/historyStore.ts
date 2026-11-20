import { create } from 'zustand';
import {
  DEFAULT_HISTORY_MAX_BYTES,
  DEFAULT_HISTORY_MAX_STEPS,
  type HistoryEntry,
  type MapHistoryEntry,
  type NewHistoryEntry,
  type SelectionHistoryEntry,
  type SettingsHistoryEntry,
} from '@/core/history/commands';
import type { MapId } from '@/core/types';

export type HistoryStackKey = MapId | 'settings' | 'selection';

export interface HistoryStack<T extends HistoryEntry = HistoryEntry> {
  undo: T[];
  redo: T[];
}

export interface HistoryStacks {
  color: HistoryStack<MapHistoryEntry>;
  height: HistoryStack<MapHistoryEntry>;
  opacity: HistoryStack<MapHistoryEntry>;
  settings: HistoryStack<SettingsHistoryEntry>;
  selection: HistoryStack<SelectionHistoryEntry>;
}

const STACK_KEYS: readonly HistoryStackKey[] = [
  'color',
  'height',
  'opacity',
  'settings',
  'selection',
];

function createEmptyStacks(): HistoryStacks {
  return {
    color: { undo: [], redo: [] },
    height: { undo: [], redo: [] },
    opacity: { undo: [], redo: [] },
    settings: { undo: [], redo: [] },
    selection: { undo: [], redo: [] },
  };
}

function cloneStacks(stacks: HistoryStacks): HistoryStacks {
  return {
    color: { undo: [...stacks.color.undo], redo: [...stacks.color.redo] },
    height: { undo: [...stacks.height.undo], redo: [...stacks.height.redo] },
    opacity: { undo: [...stacks.opacity.undo], redo: [...stacks.opacity.redo] },
    settings: { undo: [...stacks.settings.undo], redo: [...stacks.settings.redo] },
    selection: { undo: [...stacks.selection.undo], redo: [...stacks.selection.redo] },
  };
}

function computeTotalBytes(stacks: HistoryStacks): number {
  let bytes = 0;
  for (const key of STACK_KEYS) {
    const stack = stacks[key];
    for (const entry of stack.undo) bytes += entry.byteSize;
    for (const entry of stack.redo) bytes += entry.byteSize;
  }
  return bytes;
}

function computeTotalUndoSteps(stacks: HistoryStacks): number {
  let count = 0;
  for (const key of STACK_KEYS) {
    count += stacks[key].undo.length;
  }
  return count;
}

function computeTotalEntries(stacks: HistoryStacks): number {
  let count = 0;
  for (const key of STACK_KEYS) {
    count += stacks[key].undo.length + stacks[key].redo.length;
  }
  return count;
}

function evictOldestEntries(
  stacks: HistoryStacks,
  maxBytes: number,
  maxSteps: number,
  protectedSeq: number,
): number {
  while (computeTotalUndoSteps(stacks) > maxSteps) {
    let oldestKey: HistoryStackKey | null = null;
    let oldestSeq = Infinity;
    for (const key of STACK_KEYS) {
      const first = stacks[key].undo[0];
      if (first && first.seq < oldestSeq) {
        oldestSeq = first.seq;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    stacks[oldestKey].undo.shift();
  }

  let totalBytes = computeTotalBytes(stacks);
  while (totalBytes > maxBytes && computeTotalEntries(stacks) > 1) {
    let candidateKey: HistoryStackKey | null = null;
    let candidateBucket: 'undo' | 'redo' | null = null;
    let candidateSeq = Infinity;

    for (const key of STACK_KEYS) {
      const stack = stacks[key];
      const oldestUndo = stack.undo[0];
      if (oldestUndo && oldestUndo.seq !== protectedSeq && oldestUndo.seq < candidateSeq) {
        candidateSeq = oldestUndo.seq;
        candidateKey = key;
        candidateBucket = 'undo';
      }
      const oldestRedo = stack.redo[0];
      if (oldestRedo && oldestRedo.seq !== protectedSeq && oldestRedo.seq < candidateSeq) {
        candidateSeq = oldestRedo.seq;
        candidateKey = key;
        candidateBucket = 'redo';
      }
    }

    if (!candidateKey || !candidateBucket) break;
    const removed = stacks[candidateKey][candidateBucket].shift();
    if (!removed) break;
    totalBytes -= removed.byteSize;
  }

  return computeTotalBytes(stacks);
}

export interface HistoryState {
  stacks: HistoryStacks;
  seq: number;
  totalBytes: number;
  maxBytes: number;
  maxSteps: number;
  pushMapEntry: (mapId: MapId, entry: NewHistoryEntry<MapHistoryEntry>) => MapHistoryEntry;
  pushSettingsEntry: (entry: NewHistoryEntry<SettingsHistoryEntry>) => SettingsHistoryEntry;
  pushSelectionEntry: (entry: NewHistoryEntry<SelectionHistoryEntry>) => SelectionHistoryEntry;
  popGlobalUndo: () => HistoryEntry | null;
  popGlobalRedo: () => HistoryEntry | null;
  popMapUndo: (mapId: MapId) => MapHistoryEntry | null;
  setLimits: (limits: { maxBytes?: number; maxSteps?: number }) => void;
  clearAll: () => void;
}

export function selectGlobalUndoEntry(state: Pick<HistoryState, 'stacks'>): HistoryEntry | null {
  let best: HistoryEntry | null = null;
  for (const key of STACK_KEYS) {
    const undo = state.stacks[key].undo;
    const top = undo[undo.length - 1];
    if (top && (!best || top.seq > best.seq)) {
      best = top;
    }
  }
  return best;
}

export function selectGlobalRedoEntry(state: Pick<HistoryState, 'stacks'>): HistoryEntry | null {
  let best: HistoryEntry | null = null;
  for (const key of STACK_KEYS) {
    const redo = state.stacks[key].redo;
    const top = redo[redo.length - 1];
    if (top && (!best || top.seq < best.seq)) {
      best = top;
    }
  }
  return best;
}

export function selectMapUndoEntry(
  state: Pick<HistoryState, 'stacks'>,
  mapId: MapId,
): MapHistoryEntry | null {
  const undo = state.stacks[mapId].undo;
  return undo[undo.length - 1] ?? null;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  stacks: createEmptyStacks(),
  seq: 0,
  totalBytes: 0,
  maxBytes: DEFAULT_HISTORY_MAX_BYTES,
  maxSteps: DEFAULT_HISTORY_MAX_STEPS,

  pushMapEntry: (mapId, entry) => {
    const nextSeq = get().seq + 1;
    const fullEntry: MapHistoryEntry =
      entry.kind === 'tiles' ? { ...entry, seq: nextSeq } : { ...entry, seq: nextSeq };
    set((state) => {
      const nextStacks = cloneStacks(state.stacks);
      nextStacks[mapId] = {
        undo: [...nextStacks[mapId].undo, fullEntry],
        redo: [],
      };
      const totalBytes = evictOldestEntries(nextStacks, state.maxBytes, state.maxSteps, nextSeq);
      return {
        stacks: nextStacks,
        seq: nextSeq,
        totalBytes,
      };
    });
    return fullEntry;
  },

  pushSettingsEntry: (entry) => {
    const nextSeq = get().seq + 1;
    const fullEntry: SettingsHistoryEntry = { ...entry, seq: nextSeq };
    set((state) => {
      const nextStacks = cloneStacks(state.stacks);
      nextStacks.settings = {
        undo: [...nextStacks.settings.undo, fullEntry],
        redo: [],
      };
      const totalBytes = evictOldestEntries(nextStacks, state.maxBytes, state.maxSteps, nextSeq);
      return {
        stacks: nextStacks,
        seq: nextSeq,
        totalBytes,
      };
    });
    return fullEntry;
  },

  pushSelectionEntry: (entry) => {
    const nextSeq = get().seq + 1;
    const fullEntry: SelectionHistoryEntry = { ...entry, seq: nextSeq };
    set((state) => {
      const nextStacks = cloneStacks(state.stacks);
      nextStacks.selection = {
        undo: [...nextStacks.selection.undo, fullEntry],
        redo: [],
      };
      const totalBytes = evictOldestEntries(nextStacks, state.maxBytes, state.maxSteps, nextSeq);
      return {
        stacks: nextStacks,
        seq: nextSeq,
        totalBytes,
      };
    });
    return fullEntry;
  },

  popGlobalUndo: () => {
    const state = get();
    let bestKey: HistoryStackKey | null = null;
    let bestSeq = -1;
    for (const key of STACK_KEYS) {
      const undo = state.stacks[key].undo;
      const top = undo[undo.length - 1];
      if (top && top.seq > bestSeq) {
        bestSeq = top.seq;
        bestKey = key;
      }
    }
    if (!bestKey) return null;

    let popped: HistoryEntry | null = null;
    set((prev) => {
      const nextStacks = cloneStacks(prev.stacks);
      const stack = nextStacks[bestKey];
      const top = stack.undo.pop();
      if (!top) return prev;
      stack.redo.push(top as never);
      popped = top;
      return { stacks: nextStacks };
    });
    return popped;
  },

  popGlobalRedo: () => {
    const state = get();
    let bestKey: HistoryStackKey | null = null;
    let bestSeq = Infinity;
    for (const key of STACK_KEYS) {
      const redo = state.stacks[key].redo;
      const top = redo[redo.length - 1];
      if (top && top.seq < bestSeq) {
        bestSeq = top.seq;
        bestKey = key;
      }
    }
    if (!bestKey) return null;

    let popped: HistoryEntry | null = null;
    set((prev) => {
      const nextStacks = cloneStacks(prev.stacks);
      const stack = nextStacks[bestKey];
      const top = stack.redo.pop();
      if (!top) return prev;
      stack.undo.push(top as never);
      popped = top;
      return { stacks: nextStacks };
    });
    return popped;
  },

  popMapUndo: (mapId) => {
    const undo = get().stacks[mapId].undo;
    if (undo.length === 0) return null;

    let popped: MapHistoryEntry | null = null;
    set((prev) => {
      const nextStacks = cloneStacks(prev.stacks);
      const top = nextStacks[mapId].undo.pop();
      if (!top) return prev;
      nextStacks[mapId].redo.push(top);
      popped = top;
      return { stacks: nextStacks };
    });
    return popped;
  },

  setLimits: ({ maxBytes, maxSteps }) => {
    set((prev) => {
      const nextMaxBytes =
        maxBytes !== undefined ? Math.max(1, Math.floor(maxBytes)) : prev.maxBytes;
      const nextMaxSteps =
        maxSteps !== undefined ? Math.max(1, Math.floor(maxSteps)) : prev.maxSteps;
      const nextStacks = cloneStacks(prev.stacks);
      const totalBytes = evictOldestEntries(nextStacks, nextMaxBytes, nextMaxSteps, -1);
      return {
        stacks: nextStacks,
        maxBytes: nextMaxBytes,
        maxSteps: nextMaxSteps,
        totalBytes,
      };
    });
  },

  clearAll: () => {
    set({
      stacks: createEmptyStacks(),
      seq: 0,
      totalBytes: 0,
    });
  },
}));
