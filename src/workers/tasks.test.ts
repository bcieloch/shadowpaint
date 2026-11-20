import { describe, expect, it } from 'vitest';
import { useUiStore } from '@/state/uiStore';
import { runTask, TaskCancelledError } from '@/workers/tasks';

describe('runTask', () => {
  it('registers progress in uiStore and removes task on completion', async () => {
    const result = await runTask(
      { labelKey: 'common.loading', cancellable: false },
      async (ctx) => {
        ctx.setProgress(0.5);
        expect(useUiStore.getState().tasks).toHaveLength(1);
        expect(useUiStore.getState().tasks[0]?.progress).toBe(0.5);
        ctx.setProgress(1);
        return 42;
      },
    );

    expect(result).toBe(42);
    expect(useUiStore.getState().tasks).toHaveLength(0);
  });

  it('supports cancellation via signal and task.cancel()', async () => {
    await expect(
      runTask({ labelKey: 'common.loading', cancellable: true }, async (ctx) => {
        const task = useUiStore.getState().tasks[0];
        task?.cancel?.();
        ctx.throwIfAborted();
        return 'never';
      }),
    ).rejects.toThrow(TaskCancelledError);

    expect(useUiStore.getState().tasks).toHaveLength(0);
  });
});
