import { useI18n } from '@/ui/hooks/useI18n';

const OPACITY_TICKS = [0, 25, 50, 75, 100];

export function OpacityLegend() {
  const { t } = useI18n();

  return (
    <div
      data-testid="opacity-legend"
      className="pointer-events-none w-56 rounded-md border border-border bg-background/85 px-2.5 py-2 shadow-md backdrop-blur-sm"
    >
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
        <span>{t('viewport.legendOpacityTitle')}</span>
        <span className="font-mono text-foreground">0–100%</span>
      </div>
      <div
        className="h-2.5 w-full rounded-sm border border-border/80"
        style={{ background: 'linear-gradient(to right, #000000 0%, #ffffff 100%)' }}
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        {OPACITY_TICKS.map((v) => (
          <span key={v}>{v}%</span>
        ))}
      </div>
    </div>
  );
}
