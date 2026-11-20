import { useUiStore, type RightTabId } from '@/state/uiStore';
import { ScrollArea } from '@/ui/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/ui/tabs';
import { useI18n } from '@/ui/hooks/useI18n';
import { CanvasCalibrationPanel } from '@/ui/panels/right/CanvasCalibrationPanel';
import { CrossSectionPanel } from '@/ui/panels/right/CrossSectionPanel';
import { ExportPanel } from '@/ui/panels/right/ExportPanel';
import { LightPanel } from '@/ui/panels/right/LightPanel';
import { MapParamsPanel } from '@/ui/panels/right/MapParamsPanel';
import { MaterialPanel } from '@/ui/panels/right/MaterialPanel';

export function RightPanel() {
  const { t } = useI18n();
  const rightTab = useUiStore((s) => s.rightTab);
  const setRightTab = useUiStore((s) => s.setRightTab);

  return (
    <aside
      aria-label={t('shell.rightPanelTitle')}
      className="bg-card text-foreground flex h-full w-full flex-col"
    >
      <div className="border-border text-muted-foreground flex h-8 shrink-0 items-center border-b px-3 text-[11px] font-semibold tracking-wider uppercase">
        {t('shell.rightPanelTitle')}
      </div>
      <Tabs
        value={rightTab}
        onValueChange={(v) => setRightTab(v as RightTabId)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-border shrink-0 border-b px-2 py-1.5">
          <TabsList className="h-7 w-full justify-start">
            <TabsTrigger value="map" data-testid="right-tab-map" className="h-5 px-1.5 text-[11px]">
              {t('rightTabs.map')}
            </TabsTrigger>
            <TabsTrigger
              value="canvas"
              data-testid="right-tab-canvas"
              className="h-5 px-1.5 text-[11px]"
            >
              {t('rightTabs.canvas')}
            </TabsTrigger>
            <TabsTrigger
              value="light"
              data-testid="right-tab-light"
              className="h-5 px-1.5 text-[11px]"
            >
              {t('rightTabs.light')}
            </TabsTrigger>
            <TabsTrigger
              value="material"
              data-testid="right-tab-material"
              className="h-5 px-1.5 text-[11px]"
            >
              {t('rightTabs.material')}
            </TabsTrigger>
            <TabsTrigger
              value="section"
              data-testid="right-tab-section"
              className="h-5 px-1.5 text-[11px]"
            >
              {t('rightTabs.section')}
            </TabsTrigger>
            <TabsTrigger
              value="export"
              data-testid="right-tab-export"
              className="h-5 px-1.5 text-[11px]"
            >
              {t('rightTabs.export')}
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="map" className="mt-0 p-3">
            <MapParamsPanel />
          </TabsContent>
          <TabsContent value="canvas" className="mt-0 p-3">
            <CanvasCalibrationPanel />
          </TabsContent>
          <TabsContent value="light" className="mt-0 p-3">
            <LightPanel />
          </TabsContent>
          <TabsContent value="material" className="mt-0 p-3">
            <MaterialPanel />
          </TabsContent>
          <TabsContent value="section" className="mt-0 p-3">
            <CrossSectionPanel />
          </TabsContent>
          <TabsContent value="export" className="mt-0 p-3">
            <ExportPanel />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}
