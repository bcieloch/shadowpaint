import { ScrollArea } from '@/ui/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/ui/tabs';
import { useI18n } from '@/ui/hooks/useI18n';
import { MapParamsPanel } from '@/ui/panels/right/MapParamsPanel';

export function RightPanel() {
  const { t } = useI18n();

  return (
    <aside
      aria-label={t('shell.rightPanelTitle')}
      className="flex h-full w-full flex-col bg-card text-foreground"
    >
      <div className="flex h-8 shrink-0 items-center border-b border-border px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {t('shell.rightPanelTitle')}
      </div>
      <Tabs defaultValue="map" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-2 py-1.5">
          <TabsList className="h-7 w-full justify-start">
            <TabsTrigger value="map" className="h-5 px-2.5 text-[11px]">
              {t('rightTabs.map')}
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="map" className="mt-0 p-3">
            <MapParamsPanel />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}
