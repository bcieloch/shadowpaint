import { X } from 'lucide-react';
import { useUiStore } from '@/state/uiStore';
import { Button } from '@/ui/components/ui/button';
import { Progress } from '@/ui/components/ui/progress';
import { useI18n } from '@/ui/hooks/useI18n';

export function TaskProgress() {
  const { t } = useI18n();
  const tasks = useUiStore((s) => s.tasks);

  if (tasks.length === 0) return null;

  const current = tasks[0];
  if (!current) return null;

  const pct = Math.round(current.progress * 100);

  return (
    <div className="flex items-center gap-2" data-testid="task-progress">
      <span className="max-w-44 truncate text-foreground">
        {t(current.labelKey, current.labelParams)}
      </span>
      <Progress value={pct} className="h-1.5 w-20" />
      <span className="w-8 text-right">{pct}%</span>
      {current.cancellable && current.cancel && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={current.cancel}
          aria-label={t('tasks.cancel')}
          title={t('tasks.cancel')}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
