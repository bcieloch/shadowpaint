import { nanoid } from 'nanoid';
import type { TranslationKey, TranslationParams } from '@/i18n';
import { useUiStore } from '@/state/uiStore';

export class TaskCancelledError extends Error {
  constructor() {
    super('Task was cancelled');
    this.name = 'TaskCancelledError';
  }
}

export interface TaskContext {
  id: string;
  signal: AbortSignal;
  setProgress: (progress: number) => void;
  throwIfAborted: () => void;
}

export interface RunTaskOptions {
  labelKey: TranslationKey;
  labelParams?: TranslationParams;
  cancellable?: boolean;
}

export async function runTask<T>(
  options: RunTaskOptions,
  fn: (ctx: TaskContext) => Promise<T>,
): Promise<T> {
  const id = nanoid(8);
  const controller = new AbortController();
  const { upsertTask, removeTask } = useUiStore.getState();
  const cancellable = options.cancellable ?? false;
  let settled = false;

  const setProgress = (progress: number) => {
    if (settled) return;
    const clamped = Math.max(0, Math.min(1, progress));
    upsertTask({
      id,
      labelKey: options.labelKey,
      labelParams: options.labelParams,
      progress: clamped,
      cancellable,
      cancel: cancellable ? () => controller.abort() : undefined,
    });
  };

  setProgress(0);

  const ctx: TaskContext = {
    id,
    signal: controller.signal,
    setProgress,
    throwIfAborted: () => {
      if (controller.signal.aborted) {
        throw new TaskCancelledError();
      }
    },
  };

  try {
    return await fn(ctx);
  } finally {
    settled = true;
    removeTask(id);
  }
}
